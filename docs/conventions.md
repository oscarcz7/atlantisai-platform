# Convenciones

## TypeScript
- `strict: true`, sin `any` (usar `unknown` y validar). Sin `!` salvo en pruebas.
- Tipos de dominio y enums en `packages/domain`; se importan desde ahí en api, web y gateway.
- Validación de entrada con DTOs (`class-validator`) en la API y `zod` en el frontend y el gateway.
- Errores de dominio como clases (`DomainError` con `code`), nunca strings sueltos. Los códigos de rechazo del motor viven en `packages/domain/rejection-codes.ts`.

## Backend (NestJS)
- Un módulo por dominio: `controller` delgado → `service` con la lógica → `repository` con Prisma.
- Los servicios reciben el `TenantContext` explícitamente; nunca leen el tenant de una variable global.
- Operaciones que cambian dinero, cupos o credenciales: dentro de `prisma.$transaction` con bloqueo adecuado.
- Eventos de dominio con `@nestjs/event-emitter` dentro del proceso; trabajo asíncrono, reintentos y tareas programadas con pg-boss (detrás de la interfaz `JobQueue`, para poder migrar a Redis/BullMQ si se necesita).
- Idempotencia: todo endpoint que crea cobros o reservas acepta `Idempotency-Key`.

## Frontend (Next.js)
- App Router, Server Components por defecto; Client Components solo donde haya interacción.
- Datos con TanStack Query contra la API; nunca acceso directo a la base de datos desde `apps/web`.
- Formularios con React Hook Form + zod.
- Ningún cálculo de negocio en el cliente: totales y validaciones vienen del endpoint de simulación.

## Nombres
- Código en inglés (`Reservation`, `Amenity`, `Occupancy`); textos de usuario en español.
- Tablas en `snake_case` plural; columnas en `snake_case`; modelos Prisma en `PascalCase` con `@@map`.
- Archivos en `kebab-case`.

## Pruebas
- `packages/rules`: cobertura ≥ 90 %, una prueba de aceptación y una de rechazo por regla (R01–R10, C01–C04).
- Servicios: pruebas de integración contra PostgreSQL real (Testcontainers), incluido el aislamiento entre tenants.
- E2E: flujos A–F de la especificación con Playwright.
- Agentes de IA: evals en `ai/evals/` antes de cambiar un prompt o modelo.

## Git
- Ramas `feat/…`, `fix/…`, `chore/…`. Pull request obligatorio a `main` con CI verde.
- Commits con Conventional Commits en inglés (`feat(reservations): apply cleaning combos`).
- Cambios de reglas o decisiones actualizan `docs/` en el mismo PR.

## Seguridad
- Secretos solo en el gestor de secretos; `.env` local nunca se versiona.
- Cédulas cifradas a nivel de campo; teléfonos enmascarados en logs (`+5939****694`).
- Logs estructurados en JSON sin datos personales ni tokens.
- Webhooks de WhatsApp: verificación de firma `X-Hub-Signature-256` antes de procesar.
- Enlaces de pases y formularios: tokens firmados, de un solo propósito y con vencimiento.
- Archivos subidos: validar tipo y tamaño; nunca servir desde una URL pública permanente.
- RLS activo en todas las tablas de negocio; pruebas automáticas que intentan leer datos de otro tenant.
