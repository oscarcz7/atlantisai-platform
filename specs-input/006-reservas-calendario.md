# 006 · Reservas y calendario maestro

## Para /speckit.specify

En la Fase 1 la administración reserva en nombre de los residentes desde el dashboard. Necesitamos crear, consultar, cancelar y visualizar reservas, respetando el motor de reglas y evitando que dos personas tomen el mismo espacio o el último cupo al mismo tiempo.

Historias:
1. Como Administrador, quiero crear una reserva eligiendo unidad, persona, área o combo, fecha, horario y número de asistentes, viendo antes el resultado del motor y los cobros.
2. Como Administrador, quiero un calendario por área y una vista de todo el edificio por día y semana, con el estado de cada reserva.
3. Como Administrador, quiero cancelar una reserva con motivo.
4. Como Administrador, quiero bloquear un área por mantenimiento o evento del edificio.
5. Como Administrador, quiero que las reservas pendientes de pago se liberen solas si vence el plazo.
6. Como Administrador, quiero registrar los nombres de los asistentes (opcional) para tener control.

Criterios de aceptación:
- Una reserva rechazada por el motor no se guarda y se muestra el motivo.
- Dos solicitudes simultáneas por el mismo espacio exclusivo: solo una se guarda. Dos solicitudes simultáneas por el último cupo de un área compartida: solo una se guarda.
- Una reserva con limpieza nace pendiente de pago y se libera al vencer el plazo configurado.
- Al confirmar una reserva con invitados extra, se registra el cargo a la unidad.
- Cancelar una reserva confirmada libera el espacio; el tratamiento del pago de limpieza sigue el parámetro de cancelación.
- Un bloqueo administrativo impide reservar en ese horario.
- Toda creación, cambio de estado y cancelación queda en auditoría.

Fuera de alcance: emisión de QR (Fase 2), reservas por WhatsApp (Fase 3), aprobación de pagos (spec 008).

## Para /speckit.plan

Respetar la constitución, `docs/domain-model.md` (Reservas), `docs/business-rules.md` y los skills `reglas-reservas`, `nestjs-module`, `prisma-multitenant` y `dashboard-ui`.

- Módulo `reservations` que carga el contexto, llama a `evaluateReservation` y persiste dentro de una transacción con advisory lock por `(tenant, área, día)`, re-verificando disponibilidad dentro del bloqueo.
- Restricción de exclusión con `tstzrange` para áreas exclusivas como segunda barrera.
- `POST /reservations/simulate` (sin guardar) y `POST /reservations` con `Idempotency-Key`.
- Job programado (pg-boss) que expira reservas pendientes de pago.
- Eventos de dominio `ReservationConfirmed` y `ReservationCancelled` (los consumirá `access` en Fase 2).
- Pantallas: calendario (día/semana, por área y general), formulario en panel lateral con simulación en vivo, detalle con historial de estados.
