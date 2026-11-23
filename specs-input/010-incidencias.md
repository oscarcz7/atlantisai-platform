# 010 · Incidencias

## Para /speckit.specify
Tickets con categoría, ubicación, urgencia, descripción, fotos y estados (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`). Detección de posibles duplicados en la misma ubicación y categoría en las últimas 48 horas, y suscripción de vecinos para aviso al cierre.

## Para /speckit.plan
Módulo `incidents` con tablas `tickets` y `ticket_subscribers` (RLS forzado), auditoría en cambios de estado y pantalla `/dashboard/incidents`.
