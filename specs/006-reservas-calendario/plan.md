# Plan técnico · 006-reservas-calendario

- **Prisma + migración `20261123040000_reservations_rls`:** Tablas `reservations`, `reservation_amenities`, `reservation_attendees`, todas con `tenant_id` y RLS forzado.
- **Backend (`apps/api/src/modules/reservations/`):**
  - `POST /reservations/simulate`: evalúa con `evaluateReservation` sin persistir.
  - `POST /reservations`: advisory lock transaccional por `(tenant, amenity, día)`, re-evaluación dentro del bloqueo, `Idempotency-Key`, auditoría.
  - `GET /reservations`: consulta de calendario por rango de fechas y área.
  - `POST /reservations/admin-blocks`: bloqueo administrativo.
  - `POST /reservations/:id/cancel`: cancelación con motivo y auditoría.
  - Expiración automática de `PENDING_PAYMENT` vencidas (`expirePendingReservations`).
- **Frontend:** `/dashboard/reservations` con vista de reservas y acciones.
