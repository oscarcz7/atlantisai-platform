# Reglas de negocio

Fuente: Manual de Uso de Áreas Comunales del Edificio NOAH. Todos los valores concretos viven en la configuración del edificio (`seed/noah.config.json` para NOAH); aquí se describe la regla, no el valor. Los puntos sin definir están en `docs/pending-decisions.md`.

El motor (`packages/rules`) evalúa en este orden y se detiene en el primer rechazo. Cada rechazo devuelve su código, que el dashboard y el bot traducen a un mensaje en español.

## R01 · Ocupación vigente
La persona tiene una `Occupancy` vigente en la unidad en la fecha de la reserva.
Rechazo: `NO_ACTIVE_OCCUPANCY`.

## R02 · Rol permitido en el área
Según `AmenityAccessRule`. Para NOAH:
- `OWNER_RESIDENT` y `LONG_TERM_TENANT`: las 11 áreas.
- `OWNER_LANDLORD`: ninguna mientras su unidad tenga un arrendatario fijo vigente.
- `AIRBNB_GUEST`: Coworking, Salas de reuniones, Gimnasio, Pet Zone, Área Húmeda, Área Lúdica, Play Zone. Prohibidas: Home Cine, Lounge, Salón Comunal, BBQ.
- `AIRBNB_HOST`: según Manual §10, en modalidad renta corta puede acceder a las 4 áreas prohibidas al huésped (Home Cine, Lounge, Salón Comunal, BBQ); fuera de estancia activa, provisionalmente las 11 áreas (confirmar matiz en P-02).
Rechazo: `ROLE_NOT_ALLOWED`.

## R03 · Sin suspensión administrativa
La unidad no tiene una sanción vigente (Manual §8).
Rechazo: `UNIT_SUSPENDED`.

## R04 · Mora
Meses de alícuota vencidos ≤ `arrearsToleranceMonths`.
Rechazo: `ARREARS_LIMIT_EXCEEDED`.

## R05 · Garantía
Si `amenity.requiresDeposit`, el saldo de garantía de la unidad es ≥ `depositRequiredCents`. Si se descontó por daños, la unidad queda bloqueada hasta reponer el total (Manual §4).
Rechazo: `DEPOSIT_INCOMPLETE`.

## R06 · Horario y duración
El bloque `[inicio, fin)` cae dentro de `amenity.schedule` y su duración ≤ `maxDurationMinutes`.
Rechazos: `OUTSIDE_SCHEDULE`, `DURATION_EXCEEDED`.

## R07 · Anticipación
- Regla general: inicio − ahora ≥ `generalAdvanceHours` (Manual: 1 día).
- Excepción: si el área permite aviso corto, inicio − ahora ≥ `shortNoticeAdvanceMinutes` (Manual: 1 hora), siempre que en áreas exclusivas no exista otra reserva confirmada en ese horario y en áreas compartidas haya aforo (provisional, ver P-07).
Rechazo: `INSUFFICIENT_ADVANCE`.

## R08 · Frecuencia
Reservas de la unidad en el periodo (semana calendario lunes–domingo, o mes calendario) < `frequency.max`. Se cuentan reservas `CONFIRMED`, `IN_REVIEW`, `PENDING_PAYMENT` y `COMPLETED`. Un combo cuenta una vez por cada área que incluye.
Rechazo: `FREQUENCY_LIMIT_REACHED`.

## R09 · Disponibilidad
- `EXCLUSIVE`: ninguna reserva activa se solapa con el bloque en ninguna de las áreas pedidas.
- `SHARED`: la suma de asistentes de las reservas solapadas + los nuevos ≤ `capacity`.
- `FREE_USE`: no se reserva (el bot solo informa normas).
Se verifica dentro de una transacción con bloqueo por área.
Rechazos: `SLOT_TAKEN`, `CAPACITY_EXCEEDED`, `AMENITY_NOT_RESERVABLE`.

## R10 · Aforo de la reserva
`declaredAttendees` ≤ `capacity` (Manual §8: ninguna reserva puede superar el aforo).
Rechazo: `CAPACITY_EXCEEDED`.

## Cobros

### C01 · Invitados extra declarados
Solo si `amenity.appliesGuestQuota`.
`incluidos = 1 + unitType.includedGuests`
`extras = max(0, declaredAttendees − incluidos)`
`cargo = extras × extraGuestDeclaredCents`
Se registra como `LedgerEntry` `EXTRA_GUEST` (cuándo se exige el pago: P-12).

| Tipología | Incluidos |
| --- | --- |
| Estudio (1 dorm.) | 1 + 2 = 3 |
| Suite (2 dorm.) | 1 + 3 = 4 |
| Departamento (3 dorm.) | 1 + 5 = 6 |

### C02 · Invitados no declarados
`extraGuestUndeclaredCents` por persona que llega sin estar en la reserva, sin superar el aforo. Mecanismo por definir (P-10).

### C03 · Limpieza
Si la reserva incluye áreas con `cleaningFeeCents > 0`:
1. Si existe un `CleaningCombo` cuyo conjunto es exactamente esas áreas, se cobra su tarifa.
2. Si no, la suma de tarifas individuales.
El pago es previo y obligatorio: la reserva nace en `PENDING_PAYMENT`. No es reembolsable (Manual §4).

### C04 · Parqueadero de visitas
`exceso = checkOut − checkIn − freeMinutes`. Si `exceso > 0`: `ceil(exceso / 60) × overtimeFeeCentsPerHour` (cada hora o fracción). Se carga a la unidad anfitriona.

## Plazos y estados
- `PENDING_PAYMENT` expira a los `paymentProofDeadlineMinutes` desde la creación si no llega comprobante → `EXPIRED`.
- Con comprobante recibido pasa a `IN_REVIEW` y el espacio queda retenido hasta la decisión del contador.
- Al aprobar: `LedgerEntry PAYMENT`, comprobante de recaudación, `CONFIRMED`, credenciales (Fase 2).

## Ocupaciones y permisos
- Arrendatario fijo vigente ⇒ propietario `OWNER_LANDLORD` sin uso de áreas (Manual §10).
- Huésped Airbnb: ocupación con `validTo` = check-out. El anfitrión debe registrarlo antes de entregar llaves (Manual §6).
- Al vencer una ocupación, se revocan sus credenciales y reservas futuras.

## Áreas de NOAH (resumen)

| Área | Aforo | Máx. | Frecuencia | Modo | Cupos | Limpieza | Huésped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Coworking | 20 | 4 h | Diaria | Compartida | Sí | — | Sí |
| Salas de reuniones | 12 | 4 h | 4 / semana | P-05 | No | — | Sí |
| Gimnasio | 20 | 2 h | Diaria | Compartida | Sí | — | Sí |
| Pet Zone | 15 | 2 h | Diaria | P-04 | No | — | Sí |
| Área Húmeda | 20 | 3 h | 3 / semana | Compartida | Sí | — | Sí |
| Área Lúdica | 12 | 2 h | Libre | Uso libre | No | — | Sí |
| Play Zone | 15 | 3 h | Diaria | Compartida | Sí | — | Sí |
| Home Cine | 16 | 4 h | 2 / semana | Exclusiva | No | USD 10 | No |
| Lounge | 25 | 6 h | 1 / mes | Exclusiva | No | USD 30 | No |
| Salón Comunal | 50 | 6 h | 1 / mes | Exclusiva | No | USD 35 | No |
| BBQ | 40 | 6 h | 1 / mes | Exclusiva | No | USD 35 | No |

Combos: BBQ + Lounge USD 50 · Lounge + Salón USD 50 · BBQ + Salón USD 55 · Lounge + Salón + BBQ USD 90.
