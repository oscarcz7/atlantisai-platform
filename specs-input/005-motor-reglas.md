# 005 · Motor de reglas de reservas y cobros

## Para /speckit.specify

Las reglas del Manual de Uso de Áreas Comunales deben aplicarse siempre igual, se reserve desde el dashboard o desde WhatsApp. Necesitamos un motor que, dada una solicitud de reserva y la configuración del edificio, diga si se acepta, por qué se rechaza y cuánto se cobra.

Las reglas, su orden, los códigos de rechazo y las fórmulas de cobro están en `docs/business-rules.md` (R01–R10, C01–C04). Esa es la especificación funcional de esta funcionalidad.

Historias:
1. Como Administrador, quiero saber antes de guardar si una reserva cumple las reglas y, si no, el motivo exacto en lenguaje claro.
2. Como Administrador, quiero ver el desglose de cobros (invitados extra, limpieza o combo) antes de confirmar.
3. Como residente (más adelante, por WhatsApp), quiero recibir la misma respuesta que daría el dashboard.

Criterios de aceptación:
- Todos los casos de la tabla de pruebas del skill `reglas-reservas` se cumplen.
- Cada regla R01–R10 tiene al menos un caso que la acepta y uno que la rechaza con su código.
- Los cobros C01, C03 y C04 coinciden con los ejemplos del Manual (Suite con 5 personas en Gimnasio = USD 5,00; BBQ + Lounge = USD 50,00; Lounge + Salón + BBQ = USD 90,00; parqueadero 4 h 30 min = 2 horas de exceso).
- Semana calendario de lunes a domingo y mes calendario, en la zona horaria del edificio.
- El mismo resultado se obtiene con cualquier configuración equivalente; ningún valor de NOAH está en el código.
- Cada código de rechazo tiene un mensaje en español.

Fuera de alcance: persistencia y bloqueo de cupos (spec 006).

## Para /speckit.plan

Respetar la constitución (principio III) y el skill `reglas-reservas`.

- `packages/rules`: función pura `evaluateReservation(input)` con `now` y `timezone` inyectados, sin dependencias de Prisma ni NestJS.
- Tipos de entrada y salida, códigos y mensajes de rechazo en `packages/domain`.
- Cálculo de parqueadero `calculateParkingOvertime(checkIn, checkOut, config)`.
- Pruebas con Vitest y `describe.each` sobre una tabla de casos derivada del Manual; cobertura ≥ 90 %.
- Fechas con `date-fns` + `date-fns-tz` (o Temporal si el plan lo justifica).
