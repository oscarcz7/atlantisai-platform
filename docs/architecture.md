# Arquitectura

## Principios

1. **Monolito modular.** Un solo servicio backend (`apps/api`) con módulos de dominio aislados. Se divide solo cuando un módulo lo justifique (ADR-0001).
2. **Multi-tenant con RLS.** Una base de datos compartida, aislamiento por `tenant_id` con Row-Level Security de PostgreSQL (ADR-0002).
3. **El LLM interpreta, el código decide** (ADR-0003).
4. **El lector valida, la nube administra.** La validación del QR ocurre en el lector, sin internet. La nube crea, revoca y audita credenciales a través del Edge Gateway (ADR-0004).
5. **Un número de WhatsApp por edificio** (ADR-0005).
6. **Google Cloud con Cloud Run** (ADR-0006) y **colas en PostgreSQL** para el piloto (ADR-0007).

## Componentes

| Componente | Responsabilidad |
| --- | --- |
| `apps/web` | Dashboard (admin, contador, superadmin) y consola de garita. Habla solo con `apps/api`. |
| `apps/api` | API REST + WebSocket, módulos de dominio, webhook de WhatsApp, orquestador de IA, workers de colas (pg-boss). |
| `packages/rules` | Motor de reglas puro: recibe un contexto (persona, unidad, área, configuración, reservas existentes) y devuelve aceptación o rechazo con código, más el desglose de cobros. Sin I/O. |
| `apps/gateway` | Corre en el edificio. Túnel saliente hacia `apps/api`, cliente ISAPI de los lectores, cola local, NTP, reporte de estado. |
| PostgreSQL + pgvector (Cloud SQL) | Datos de negocio, colas y fragmentos del Manual para el RAG. |
| Colas (pg-boss sobre PostgreSQL) | Trabajos asíncronos, reintentos y tareas programadas, sin servidor Redis en el piloto (ADR-0007). |
| Cloud Storage | Comprobantes, fotos de incidencias, PDF emitidos. Acceso solo por URL firmada. |
| WhatsApp Cloud API | Entrada y salida de mensajes del bot. |
| Proveedor LLM | Clasificación de intención, extracción de datos, RAG, lectura de comprobantes. Detrás de la interfaz `LlmProvider`. |

## Módulos del backend (`apps/api/src/modules`)

| Módulo | Contenido | Fase |
| --- | --- | --- |
| `auth` | Login, 2FA TOTP, sesiones, guardas de rol. | 1 |
| `tenants` | Edificios, parámetros, clonación. | 1 |
| `catalog` | Tipologías, áreas, matriz de acceso, combos, parqueaderos, lectores. | 1 |
| `cadastre` | Unidades, personas, ocupaciones (contratos y estancias). | 1 |
| `reservations` | Reservas, asistentes, calendario. Usa `packages/rules`. | 1 |
| `billing` | Movimientos de cuenta, alícuotas, garantías, comprobantes de pago y de recaudación. | 1 |
| `visits` | Visitas, parqueaderos, consola de garita. | 1 |
| `incidents` | Tickets, deduplicación, suscripciones. | 1 |
| `audit` | Registro de auditoría y reportes. | 1 |
| `access` | Credenciales, órdenes al gateway, eventos de acceso, pases digitales. | 2 |
| `messaging` | Webhook y envío de WhatsApp, plantillas, ventana de 24 h. | 3 |
| `ai` | Orquestador, agentes, herramientas, RAG, lectura de comprobantes. | 3 |

Regla de dependencias: los módulos se comunican por servicios públicos o eventos de dominio, nunca leyendo tablas de otro módulo. `ai` y `messaging` dependen de los demás; ningún módulo de negocio depende de `ai`.

## Flujos de datos clave

**Reserva desde el dashboard o el bot**
`controller / herramienta de IA → ReservationsService.create() → carga contexto → packages/rules.evaluate() → transacción con bloqueo → reserva + movimientos → evento ReservationConfirmed → (Fase 2) AccessService emite credenciales`.

**Carga de credencial (Fase 2)**
`ReservationConfirmed → AccessService crea Credential(PENDING) → cola gateway-commands → gateway aplica ISAPI → ack → Credential(LOADED) → pase disponible`.

**Mensaje de WhatsApp (Fase 3)**
`webhook → verificación de firma → encolar → worker: identificar tenant por phone_number_id y persona por wa_id → orquestador → agente → herramientas (servicios del backend) → respuesta`.

## Despliegue

- Ambientes: `dev`, `staging`, `prod`, cada uno con su base de datos y secretos.
- Nube: Google Cloud (ADR-0006). Cloud Run para `api` y `web`, Cloud SQL para PostgreSQL, Cloud Storage, Secret Manager, Artifact Registry.
- Región: `us-east1` (latencia baja hacia Ecuador).
- Infraestructura como código con Terraform en `infra/`.
- `main` despliega a staging automáticamente; producción por tag `vX.Y.Z` con aprobación manual.
- Migraciones con `prisma migrate deploy` en el pipeline, antes de arrancar la nueva versión.
- El gateway se actualiza por un canal propio (imagen versionada), nunca desde la nube sin confirmación.

## Fases

| Fase | Entrega | Criterio de salida |
| --- | --- | --- |
| 0 | Monorepo, CI/CD, infraestructura, esquema multi-tenant | Un commit llega solo a staging |
| 1 | Dashboard + motor de reglas | Flujos A–F operables desde el dashboard con datos de NOAH |
| 2 | Gateway, credenciales QR, pases, monitor de lectores | Una semana de reservas reales con QR en paralelo a los tags |
| 3 | WhatsApp, orquestador, 4 agentes, RAG, lectura de comprobantes | Evals de conversación aprobadas; nada se cobra sin confirmación |
| 4 | Piloto en NOAH | Criterios acordados con la gerencia |
