# 002 · Acceso al dashboard y usuarios internos

## Para /speckit.specify

El dashboard será usado por personal de la constructora, la administradora, el contador y los guardias. Necesitamos que solo personas autorizadas entren, con segundo factor, y que cada una vea únicamente lo que su rol y sus edificios le permiten.

Roles: SuperAdmin (toda la plataforma), Administrador de edificio, Contador, Guardia. Una persona puede tener acceso a uno o varios edificios.

Historias:
1. Como usuario interno, quiero iniciar sesión con correo, contraseña y un código de mi aplicación autenticadora.
2. Como usuario nuevo, quiero recibir una invitación por correo para crear mi contraseña y configurar el segundo factor.
3. Como usuario, quiero recuperar el acceso si olvido mi contraseña.
4. Como SuperAdmin, quiero invitar, editar, desactivar usuarios y asignarles rol y edificios.
5. Como usuario con varios edificios, quiero cambiar de edificio desde un selector y que todo el dashboard muestre solo ese edificio.
6. Como responsable de seguridad, quiero que cada inicio de sesión, fallo y cambio de permisos quede registrado.

Criterios de aceptación:
- Sin segundo factor configurado no se accede a ninguna pantalla del dashboard.
- Tras 5 intentos fallidos seguidos la cuenta se bloquea 15 minutos y queda registrado.
- La sesión expira tras 30 minutos de inactividad (configurable).
- Un Contador no ve el monitor de accesos ni la consola de garita; un Guardia no ve la bandeja contable ni los parámetros del edificio.
- Un usuario sin acceso a un edificio recibe un error al intentar consultar sus datos aunque conozca su identificador.
- Desactivar un usuario cierra sus sesiones activas.
- La invitación vence a las 72 horas.

Fuera de alcance: acceso de residentes (se identifican por WhatsApp en Fase 3), inicio de sesión con Google u otros proveedores.

## Para /speckit.plan

Respetar la constitución, `docs/conventions.md` (Seguridad) y los skills `nestjs-module`, `prisma-multitenant` y `dashboard-ui`.

- Módulo `auth` en NestJS: contraseñas con argon2id, TOTP (RFC 6238) con secreto cifrado, códigos de recuperación de un solo uso.
- Sesiones con JWT de corta duración + refresh token rotativo en cookie `httpOnly`, `secure`, `sameSite=strict`; lista de revocación en base de datos.
- `TenantContext` resuelto desde la sesión y el edificio seleccionado; guardas `@Roles()` por endpoint, denegar por defecto.
- Envío de correos detrás de la interfaz `Mailer` (implementación real a definir en el plan; falsa para pruebas).
- Pantallas: inicio de sesión, configuración de 2FA con QR, recuperación, gestión de usuarios (lista + panel lateral), selector de edificio.
- Auditoría de eventos de autenticación.
