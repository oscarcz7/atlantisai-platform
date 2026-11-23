# Tareas · 006-reservas-calendario

1. [x] Crear rama `feat/006-reservas-calendario` y documentos de especificación.
2. [x] Agregar tablas `reservations`, `reservation_amenities` y `reservation_attendees` con RLS forzado.
3. [x] Implementar `ReservationsService` y `ReservationsController` (simulación, creación con advisory lock e idempotencia, cancelación, bloqueos administrativos, expiración).
4. [x] Escribir pruebas de integración en PostgreSQL (concurrencia simultánea, idempotencia, combos, expiración, bloqueos, RLS).
5. [x] Construir pantalla `/dashboard/reservations` en `apps/web`.
6. [x] Ejecutar suite completa (`build`, `lint`, `typecheck`, `test`, `test:int`) y hacer commit.
