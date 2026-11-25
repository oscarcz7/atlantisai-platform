# Spec 002 · Acceso al dashboard y usuarios internos

- **Rama:** `feat/002-auth-usuarios`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Implementada y refinada (v1.1)
- **Origen:** [`specs-input/002-auth-usuarios.md`](../../specs-input/002-auth-usuarios.md)

## Objetivo

Permitir que el personal autorizado (`SUPERADMIN`, `ADMIN`, `ACCOUNTANT`, `GUARD`) acceda al dashboard con autenticación segura (correo, contraseña y 2FA TOTP obligatorio), selector de edificio multi-tenant, control de acceso por rol y gestión jerárquica de usuarios internos con auditoría.

## Criterios de aceptación

- [x] Sin 2FA TOTP configurado, un usuario no puede acceder a ningún endpoint protegido del dashboard (solo a la configuración/verificación de 2FA).
- [x] Tras 5 intentos fallidos consecutivos, la cuenta se bloquea 15 minutos y queda registrado en auditoría.
- [x] La sesión expira tras 30 minutos de inactividad (configurable vía `SESSION_IDLE_MINUTES`).
- [x] Guardas `@Roles(...)` por endpoint con denegación por defecto: Contador no ve garita/accesos; Guardia no ve finanzas/configuración.
- [x] Un usuario sin acceso a un edificio recibe HTTP 403 al consultar o editar datos de ese `tenantId`.
- [x] Desactivar un usuario revoca inmediatamente todas sus sesiones activas.
- [x] Las invitaciones de usuario vencen a las 72 horas; los tokens de recuperación vencen en 1 hora.
- [x] Todo inicio de sesión, fallo, bloqueo, activación de 2FA y cambio de usuario/permisos queda en auditoría.

## Refinamientos SDD (v1.1)

- **Separación de consolas por rol:**
  - `SUPERADMIN` opera la **Consola SaaS** sin selector de edificio ni pestañas operativas: solo **Resumen SaaS**, **Edificios** y **Administradores**.
  - `ADMIN` opera sus edificio(s) asignado(s) con el selector de edificio activo y gestiona su propio equipo (`ACCOUNTANT` y `GUARD`).
- **Gestión jerárquica de usuarios (`staff-users`):**
  - `SUPERADMIN` invita, edita edificios asignados (multi-edificio), desactiva o elimina permanentemente (`DELETE /staff-users/:id?permanent=true`) cuentas `ADMIN` y `SUPERADMIN`.
  - `ADMIN` puede invitar, editar edificios asignados, desactivar o eliminar únicamente cuentas `ACCOUNTANT` y `GUARD` restringidas a los edificios que ese `ADMIN` administra (HTTP 403 fuera de alcance).
- **Aislamiento estricto al cambiar de edificio en UI:**
  - El `tenantId` activo persiste en `localStorage` + `sessionStorage` (no se pierde al recargar) y el contenedor principal del dashboard se remonta con `key={tenantId}` para impedir estado residual o ediciones cruzadas entre edificios.
- **UX de login 2FA:**
  - La respuesta `TOTP_REQUIRED` tras validar correo/contraseña muestra un indicador neutro con `autoFocus` en el campo de 6 dígitos (no una alerta roja de error).
