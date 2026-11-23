# Spec 006 · Reservas y calendario maestro

- **Rama:** `feat/006-reservas-calendario`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Aprobada para implementación
- **Origen:** [`specs-input/006-reservas-calendario.md`](../../specs-input/006-reservas-calendario.md)

## Objetivo

Crear, simular, consultar, cancelar y bloquear reservas de áreas comunales usando el motor `packages/rules`, con control transaccional de concurrencia (`pg_advisory_xact_lock`), idempotencia (`Idempotency-Key`), expiración automática de reservas pendientes de pago y calendario en el dashboard.
