---
name: reglas-reservas
description: Cómo implementar, modificar o probar el motor de reglas de reservas y cobros (packages/rules): validaciones R01–R10, cobros C01–C04, combos de limpieza, cupos por tipología, frecuencia, anticipación, aforo, garantía y mora. Úsalo siempre que una tarea toque reservas, disponibilidad, cobros por invitados, limpieza, parqueadero o cualquier regla del Manual de NOAH, aunque solo sea ajustar un valor.
---

# Motor de reglas de reservas

## Fuente de verdad
- Reglas: `docs/business-rules.md` (orden, códigos, fórmulas).
- Valores de NOAH: `seed/noah.config.json`.
- Valores aún no definidos: `docs/pending-decisions.md`.

Si la regla que necesitas no está en esos archivos, no la inventes: crea un parámetro con valor provisional, regístralo en `pending-decisions.md` y menciónalo en el resumen.

## Diseño
`packages/rules` es puro: sin Prisma, sin fechas del sistema, sin red.

```ts
export function evaluateReservation(input: EvaluationInput): EvaluationResult;

type EvaluationInput = {
  now: Date;                       // inyectado, nunca new Date() dentro del motor
  tenant: TenantSettings;
  person: { occupancies: Occupancy[] };
  unit: { unitType: UnitType; arrearsMonths: number; depositBalanceCents: number; suspendedUntil?: Date };
  amenities: Amenity[];            // una o varias (combo)
  accessRules: AmenityAccessRule[];
  combos: CleaningCombo[];
  request: { startsAt: Date; endsAt: Date; declaredAttendees: number };
  existing: ExistingReservation[]; // solapadas y del periodo de frecuencia
  timezone: string;                // para semana/mes calendario y horarios
};

type EvaluationResult =
  | { ok: true; charges: Charge[]; initialStatus: 'CONFIRMED' | 'PENDING_PAYMENT' }
  | { ok: false; code: RejectionCode; details: Record<string, unknown> };
```

- Evalúa en el orden R01 → R10 y se detiene en el primer rechazo.
- Cobros C01 y C03 se calculan solo si todas las reglas pasan.
- `initialStatus = PENDING_PAYMENT` si hay limpieza; si no, `CONFIRMED`.
- Semana calendario lunes–domingo y mes calendario, calculados en `timezone`.
- Montos en centavos, enteros.

## Uso desde el backend
`ReservationsService` carga el contexto, llama al motor, y si `ok`, persiste dentro de una transacción con bloqueo por área, re-verificando disponibilidad (R09) dentro del bloqueo. El endpoint `POST /reservations/simulate` devuelve el mismo resultado sin guardar; el dashboard y el bot lo usan para mostrar el desglose.

## Pruebas
- Una prueba que acepta y una que rechaza por cada regla y cobro.
- Casos del Manual como tabla de pruebas (`describe.each`), por ejemplo:
  - Suite, Gimnasio, 5 personas → 1 extra, USD 5,00, CONFIRMED.
  - Estudio, Coworking, 3 personas → 0 extras.
  - Huésped Airbnb, BBQ → ROLE_NOT_ALLOWED.
  - BBQ + Lounge → combo USD 50,00, PENDING_PAYMENT.
  - Lounge + Salón + BBQ → combo USD 90,00.
  - Segunda reserva de Lounge en el mismo mes → FREQUENCY_LIMIT_REACHED.
  - Gimnasio con 18 asistentes ya reservados + 3 nuevos → CAPACITY_EXCEEDED.
  - Propietario con arrendatario fijo vigente → ROLE_NOT_ALLOWED.
  - Garantía descontada sin reponer en área que la requiere → DEPOSIT_INCOMPLETE.
  - Parqueadero 3 h 01 min → 1 hora de exceso; 4 h 30 min → 2 horas.
- Fechas en las pruebas siempre con zona explícita (`America/Guayaquil`).

## Checklist
- [ ] Ningún valor de NOAH escrito en el código
- [ ] `now` inyectado
- [ ] Pruebas de aceptación y rechazo
- [ ] `docs/business-rules.md` actualizado si cambió una regla
