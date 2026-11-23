# Spec 002 · Acceso al dashboard y usuarios internos

- **Rama:** `feat/002-auth-usuarios`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Aprobada para implementación
- **Origen:** [`specs-input/002-auth-usuarios.md`](../../specs-input/002-auth-usuarios.md)

## Objetivo

Permitir que el personal autorizado (`SUPERADMIN`, `ADMIN`, `ACCOUNTANT`, `GUARD`) acceda al dashboard con autenticación segura (correo, contraseña y 2FA TOTP obligatorio), selector de edificio multi-tenant, control de acceso por rol y gestión completa de usuarios internos con auditoría.

## Criterios de aceptación

- [ ] Sin 2FA TOTP configurado, un usuario no puede acceder a ningún endpoint protegido del dashboard (solo a la configuración/verificación de 2FA).
- [ ] Tras 5 intentos fallidos consecutivos, la cuenta se bloquea 15 minutos y queda registrado en auditoría.
- [ ] La sesión expira tras 30 minutos de inactividad (configurable vía `SESSION_IDLE_MINUTES`).
- [ ] Guardas `@Roles(...)` por endpoint con denegación por defecto: Contador no ve garita/accesos; Guardia no ve finanzas/configuración.
- [ ] Un usuario sin acceso a un edificio recibe HTTP 403 al consultar datos de ese `tenantId`.
- [ ] Desactivar un usuario revoca inmediatamente todas sus sesiones activas.
- [ ] Las invitaciones de usuario vencen a las 72 horas; los tokens de recuperación vencen en 1 hora.
- [ ] Todo inicio de sesión, fallo, bloqueo, activación de 2FA y cambio de usuario/permisos queda en auditoría.
