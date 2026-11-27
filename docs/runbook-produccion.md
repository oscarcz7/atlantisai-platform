# Runbook de puesta en producción

Pasos que Terraform y el pipeline **no** hacen solos. Se ejecutan en orden la primera vez que se levanta un ambiente (stg o prd). Validado el 2026-11-27 con las imágenes de producción contra una base vacía.

## 1. Infraestructura base

1. `infra/bootstrap`: `terraform apply`. Configurar en GitHub las variables `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA` (staging) y `GCP_DEPLOYER_SA_PRD` (producción). Dar a cada cuenta de servicio `roles/run.developer`, `roles/artifactregistry.writer` y `roles/iam.serviceAccountUser` **solo** en su proyecto.
2. En GitHub, el environment `production` debe exigir revisores, y los tags `v*` deben ser tags protegidos.
3. `infra/envs/<env>`: `terraform apply` (crea Cloud SQL, bucket, Secret Manager y los servicios de Cloud Run).
4. Cargar los valores de los secretos en Secret Manager:

| Secreto | Valor |
| --- | --- |
| `DATABASE_URL` | `postgresql://noah_app:<clave>@localhost/noah?host=/cloudsql/<connection_name>` |
| `DATABASE_MIGRATION_URL` | igual que la anterior, pero con el usuario `noah_owner` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32`. **No se puede rotar** sin volver a cifrar los datos. Guardar copia segura fuera de GCP. |
| `PASS_SIGNING_SECRET` | `openssl rand -hex 32` |
| `GATEWAY_API_TOKEN` | cualquier valor aleatorio. En producción **no se usa**: cada edificio tiene su propio token. |
| `SENTRY_DSN` | DSN del proyecto en Sentry |

## 2. Roles de base de datos (Cloud SQL)

La aplicación **debe** conectarse con un rol sin `BYPASSRLS` que no sea dueño de las tablas. Si no, la Row-Level Security no protege nada. Conectado como el usuario administrador de Cloud SQL:

```sql
CREATE ROLE noah_owner LOGIN PASSWORD '<clave-owner>';
CREATE ROLE noah_app   LOGIN PASSWORD '<clave-app>' NOBYPASSRLS;
GRANT ALL ON DATABASE noah TO noah_owner;
ALTER SCHEMA public OWNER TO noah_owner;
GRANT CONNECT ON DATABASE noah TO noah_app;
GRANT USAGE ON SCHEMA public TO noah_app;
CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION noah_app;
-- Conectado como noah_owner:
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER DEFAULT PRIVILEGES FOR ROLE noah_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO noah_app;
ALTER DEFAULT PRIVILEGES FOR ROLE noah_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO noah_app;
```

Los privilegios por defecto deben existir **antes** de la primera migración. Si las tablas ya se crearon sin ellos, la API responde `permission denied` (500 en el login). En ese caso, conectado como `noah_owner`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO noah_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO noah_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, staff_auth_audits FROM noah_app;
```

Verificación: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='noah_app';` debe dar `f | f`.

## 3. Primer despliegue

1. Push a `main`: corre el CI, construye las imágenes, ejecuta el job `noah-api-migrate` (Prisma va dentro de la imagen) y despliega.
2. Producción: crear el tag `vX.Y.Z` sobre un commit de `main` y aprobar el environment `production`.

## 4. Tareas administrativas (CLI dentro de la imagen)

La imagen de la API incluye los scripts compilados. Se ejecutan con la imagen desplegada y [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) desde una máquina autorizada:

```bash
cloud-sql-proxy <connection_name> --port 6543 &
IMG=us-east1-docker.pkg.dev/<proyecto>/noah/api:<tag>
DB="postgresql://noah_app:<clave-app>@host.docker.internal:6543/noah"

# Primer SUPERADMIN (la contraseña temporal se muestra una sola vez; 2FA obligatoria al ingresar)
docker run --rm --add-host=host.docker.internal:host-gateway -e DATABASE_URL="$DB" \
  $IMG node dist/scripts/staff-cli.js create --email <correo> --name "<nombre>" --role SUPERADMIN

# Otros usuarios
docker run ... $IMG node dist/scripts/staff-cli.js create --email ... --role ADMIN --tenant noah
docker run ... $IMG node dist/scripts/staff-cli.js reset-2fa --email ...
docker run ... $IMG node dist/scripts/staff-cli.js reset-password --email ...

# Una vez, después del despliegue que introduce el HMAC de cédulas (requiere la misma clave)
docker run ... -e NODE_ENV=production -e FIELD_ENCRYPTION_KEY="<clave>" $IMG node dist/scripts/rehash-national-ids.js
```

## 5. Datos del edificio

El dashboard aún no tiene pantallas de importación. Se usan los scripts de la imagen, montando en `/seed` la carpeta local con los archivos (los scripts leen `../../seed` desde `/app`):

```bash
# Configuración del edificio (tipologías, áreas, combos, parámetros). Idempotente.
docker run --rm --add-host=host.docker.internal:host-gateway -e DATABASE_URL="$DB" \
  -v "$PWD/seed:/seed:ro" $IMG node dist/scripts/seed-noah.js

# Catastro real (personas, unidades, ocupaciones) desde el archivo privado seed/noah-rezzy-cadastre.json
docker run --rm --add-host=host.docker.internal:host-gateway -e DATABASE_URL="$DB" \
  -e NODE_ENV=production -e FIELD_ENCRYPTION_KEY="<clave>" \
  -v "$PWD/seed:/seed:ro" $IMG node dist/scripts/import-noah-rezzy.js
```

Alternativa por API (SUPERADMIN): `POST /tenants/import-config` y `POST /cadastre/import/preview` → `/cadastre/import/confirm`. El archivo con datos personales **nunca** se versiona; bórralo de la máquina al terminar.
3. **Revisar en el dashboard**:
   - Al menos 1 cuenta bancaria del edificio, alícuota por m² y día de vencimiento.
   - Parqueaderos de visitas.
   - Política de cancelación.

## 6. Gateway del edificio

1. En el dashboard (Acceso → Rotar token del gateway) generar el token del edificio.
2. Instalar en el mini PC con `apps/gateway/packaging/install-linux.sh`. Configurar `GATEWAY_API_TOKEN`, `GATEWAY_API_URL` (https), `GATEWAY_MODE=hikvision`, `HIKVISION_USER`, `HIKVISION_PASS` y `GATEWAY_READER_ALLOWLIST` (o `readers.json` con la huella TLS de cada lector).
3. Activar `GATEWAY_ALLOW_REMOTE_OPEN=true` solo si se quiere apertura remota.
4. Verificar en Acceso que los lectores aparecen en línea (heartbeat cada 60 s).

## 7. Verificación final

- `GET <api>/ready` devuelve `{"status":"ready","database":"ok"}`.
- Login con 2FA del SUPERADMIN y del ADMIN del edificio.
- Una reserva de prueba de punta a punta (simular, crear, aprobar el comprobante, recibir el QR) y luego cancelarla.
- Revisar que llegan eventos a Sentry, provocando un error controlado en stg.
