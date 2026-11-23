# Plan técnico · 002-auth-usuarios

Alineado con `.specify/memory/constitution.md`, `docs/conventions.md` y los skills `nestjs-module`, `prisma-multitenant` y `dashboard-ui`.

## 1. Modelo de datos (Prisma — tablas SaaS globales)

- `StaffUser`: `id`, `email` (unique), `fullName`, `passwordHash` (argon2id), `role` (`SUPERADMIN | ADMIN | ACCOUNTANT | GUARD`), `isActive`, `totpSecretEnc` (AES-256-GCM), `totpEnabled`, `failedLoginAttempts`, `lockedUntil`, `lastLoginAt`.
- `StaffUserTenant`: relación `staffUserId` ↔ `tenantId` (PK compuesta).
- `StaffSession`: `id`, `staffUserId`, `refreshTokenHash` (SHA-256), `expiresAt`, `lastActivityAt`, `revokedAt`, `userAgent`, `ipAddress`.
- `StaffToken`: invitaciones (`INVITE`, 72 h) y recuperación (`PASSWORD_RESET`, 1 h), almacenando solo el hash SHA-256.
- `StaffRecoveryCode`: códigos de recuperación de un solo uso (hash SHA-256 + `usedAt`).
- `StaffAuthAudit`: bitácora append-only de eventos de autenticación y gestión de usuarios internos (a nivel SaaS).

## 2. Backend (`apps/api/src/modules/auth/`)

- `FieldEncryptionService`: cifrado AES-256-GCM con `FIELD_ENCRYPTION_KEY`.
- `TotpService`: RFC 6238 (HMAC-SHA1, 6 dígitos, ventana ±1 paso de 30 s) + generación de URI `otpauth://` y QR Data URL (`qrcode`).
- `Mailer` interface + `ConsoleMailer` (dev) + `InMemoryMailer` (tests).
- `AuthService`: login (bloqueo 5 fallos / 15 min), setup/confirmación de 2FA TOTP con 8 códigos de recuperación, refresh token rotativo con verificación de inactividad de 30 min, logout, invitación (72 h) y recuperación de contraseña.
- `StaffUsersService`: listar, invitar, editar rol/edificios, desactivar (revocando sesiones activas).
- Guardas: `AuthGuard` (valida JWT + 2FA habilitado + usuario activo + `TenantContext` si hay `x-tenant-id`) y `RolesGuard` (denegar por defecto si no hay `@Roles(...)`).
- Comando `pnpm --filter @noah/api seed:admin` para crear un SuperAdmin inicial en local.

## 3. Frontend (`apps/web`)

- Cliente API tipado (`apps/web/lib/api/auth.ts`) con `credentials: 'include'`.
- Pantallas: `/login`, `/setup-2fa`, `/forgot-password`, `/reset-password`, `/dashboard/users` (lista + drawer lateral de invitación/edición + selector de edificio y menú filtrado por rol).
