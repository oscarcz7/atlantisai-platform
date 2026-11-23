# 007 · Estados de cuenta y garantías

## Para /speckit.specify
Cuenta corriente por unidad (alícuotas, limpieza, invitados extra, parqueadero, daños y pagos), generación mensual de alícuotas, cálculo de meses vencidos (mora real para R04) y gestión de saldo de garantía con depósitos y descuentos por daño con motivo y evidencia (bloqueo real para R05).

## Para /speckit.plan
Módulo `billing`: `LedgerEntry`, `DepositAccount`, `DepositMovement` con RLS forzado y montos en centavos. Conectar `arrearsMonths` y `depositBalanceCents` reales al `ReservationsService`.
