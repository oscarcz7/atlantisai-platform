# Modelo de dominio

Todas las entidades de negocio llevan `tenantId`. Identificadores: UUID v7. Montos: enteros en centavos. Fechas: `timestamptz` en UTC.

## SaaS
- **Tenant** — edificio: `name`, `ruc`, `logoUrl`, `timezone`, `whatsappPhoneNumberId`, contactos, horarios de atención.
- **StaffUser** — usuario del dashboard: `email`, `role` (`SUPERADMIN | ADMIN | ACCOUNTANT | GUARD`), `totpSecret` (cifrado), tenants asignados.

## Configuración
- **TenantSettings** — `depositRequiredCents`, `arrearsToleranceMonths`, `paymentProofDeadlineMinutes`, `extraGuestDeclaredCents`, `extraGuestUndeclaredCents`, `entryMarginMinutes`, `generalAdvanceHours`, `shortNoticeAdvanceMinutes`.
- **UnitType** — `code`, `name`, `includedGuests`.
- **Amenity** — `name`, `capacity`, `maxDurationMinutes`, `schedule` (por día de semana; null = 24 h), `frequency` (`{ period: DAY|WEEK|MONTH, max }` o null), `mode` (`SHARED | EXCLUSIVE | FREE_USE`), `advancePolicy` (`GENERAL | SHORT_NOTICE_ALLOWED`), `appliesGuestQuota`, `requiresDeposit`, `cleaningFeeCents`, `hasReader`.
- **AmenityAccessRule** — `amenityId`, `occupancyRole`, `allowed`.
- **CleaningCombo** — conjunto de `amenityIds` + `feeCents`. Aplica el combo que cubre exactamente las áreas con limpieza de la reserva.
- **Reader** — `serial`, `model`, `ip`, `firmware`, `amenityIds[]`, `status`, `lastSeenAt`.
- **ParkingConfig** — `spots`, `freeMinutes`, `overtimeFeeCentsPerHour`.
- **KnowledgeDocument** / **KnowledgeChunk** — documento fuente y fragmentos con `embedding vector`.

## Catastro
- **Unit** — `number`, `floor`, `unitTypeId`, `monthlyFeeCents`.
- **Person** — `fullName`, `nationalIdEnc`, `waPhone` (E.164), `email`, `consentAt`.
- **Occupancy** — `personId`, `unitId`, `role`, `validFrom`, `validTo` (nullable).
  - Roles: `OWNER_RESIDENT`, `OWNER_LANDLORD`, `LONG_TERM_TENANT`, `AIRBNB_HOST`, `AIRBNB_GUEST`.
  - Al registrar una `LONG_TERM_TENANT` vigente, el propietario pasa a `OWNER_LANDLORD` por el mismo periodo.

## Reservas
- **Reservation** — `unitId`, `personId`, `amenityIds[]`, `startsAt`, `endsAt`, `declaredAttendees`, `status`, `channel` (`DASHBOARD | WHATSAPP`), `holdExpiresAt`.
- **Attendee** — `reservationId`, `name?`, `waPhone?`, `isExtra`, `credentialId?`.

```
PENDING_PAYMENT ──comprobante──▶ IN_REVIEW ──aprobado──▶ CONFIRMED ──fin──▶ COMPLETED
      │                              │                       │
      └──plazo vence──▶ EXPIRED      └──rechazado──▶ PENDING_PAYMENT
                                                             └──cancelación──▶ CANCELLED
Sin pago previo: creación ──▶ CONFIRMED
```

## Accesos (Fase 2)
- **Credential** — `code` (aleatorio, único por tenant), `readerIds[]`, `validFrom`, `validTo`, `maxOpens?`, `syncStatus` (`PENDING | LOADED | REVOKE_PENDING | REVOKED | ERROR`), `attendeeId? | visitId?`.
- **GatewayCommand** — `idempotencyKey`, `type` (`UPSERT_CREDENTIAL | REVOKE_CREDENTIAL | PURGE | PING`), `payload`, `status`, `attempts`.
- **AccessEvent** — `readerId`, `credentialCode?`, `result` (`GRANTED | DENIED`), `occurredAt`, `rawPayload`.

## Visitas
- **Visit** — `hostUnitId`, `visitorName`, `nationalIdEnc`, `plate?`, `needsParking`, `expectedAt`, `checkInAt?`, `checkOutAt?`, `parkingSpot?`, `registeredBy`.

## Finanzas
- **LedgerEntry** — `unitId`, `type` (`MONTHLY_FEE | CLEANING | EXTRA_GUEST | PARKING_OVERTIME | DAMAGE | PAYMENT | ADJUSTMENT`), `amountCents` (positivo = cargo, negativo = abono), `reference`, `dueDate?`.
- **DepositAccount** / **DepositMovement** — saldo de garantía por unidad; movimientos `DEPOSIT | DEDUCTION | REFUND` con motivo y evidencia.
- **PaymentProof** — `fileKey`, `extracted` (`bank, amountCents, date, reference`), `extractedBy` (`HUMAN | AI`), `status` (`PENDING | APPROVED | REJECTED`), `reviewedBy`, `reservationId?`.
- **CollectionReceipt** — PDF con numeración secuencial por tenant, `ledgerEntryIds[]`.

## Incidencias
- **Ticket** — `category`, `location`, `urgency` (`LOW | MEDIUM | HIGH | EMERGENCY`), `status` (`OPEN | IN_PROGRESS | RESOLVED | CLOSED`), `photos[]`, `reportedBy`, `subscribers[]`.

## Conversación (Fase 3)
- **Conversation** — `waId`, `personId?`, `lastInboundAt`, `handoffTo?`.
- **Message** — `direction`, `type`, `content`, `agent?`, `toolCalls?`.

## Auditoría
- **AuditLog** — `actorType` (`STAFF | PERSON | SYSTEM | AI`), `actorId`, `action`, `entity`, `entityId`, `before`, `after`, `channel`, `at`. Solo inserción.
