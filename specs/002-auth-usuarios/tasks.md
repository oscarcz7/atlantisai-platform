# Tareas · 002-auth-usuarios

1. [x] Crear rama `feat/002-auth-usuarios` y documentos `spec.md`, `plan.md`, `tasks.md`.
2. [x] Instalar dependencias de seguridad en `apps/api` (`argon2`, `jsonwebtoken`, `cookie-parser`, `qrcode`, `class-validator`, `class-transformer`).
3. [x] Agregar modelos Prisma de autenticación/usuarios y migración SQL; aplicada a PostgreSQL local.
4. [x] Implementar `FieldEncryptionService`, `TotpService` (RFC 6238) y `Mailer` (`ConsoleMailer` + `InMemoryMailer`).
5. [x] Implementar `AuthService`, `StaffUsersService`, `AuthGuard`, `RolesGuard`, `@Roles()` y controladores REST.
6. [x] Escribir pruebas unitarias e integración (2FA obligatorio, 5 fallos/bloqueo, inactividad 30 min, RBAC, aislamiento de edificios, desactivación revoca sesiones, invitación 72 h).
7. [x] Construir pantallas en `apps/web`: `/login`, `/setup-2fa`, `/forgot-password`, `/dashboard/users` y selector de edificio.
8. [x] Verificar `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:int`.
