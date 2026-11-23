# 008 · Bandeja contable y comprobantes de recaudación

## Para /speckit.specify
Cola de comprobantes de pago (`PaymentProof`) visible solo para Contador y SuperAdmin. Alerta de posible duplicado (misma referencia, monto y fecha). Al aprobar: registra abono `LedgerEntry(PAYMENT)`, emite comprobante de recaudación secuencial por edificio (`CollectionReceipt`) y confirma automáticamente la reserva asociada si existe.

## Para /speckit.plan
Extender `billing` con `PaymentProof` y `CollectionReceipt` (RLS forzado, numeración secuencial por tenant) y endpoints protegidos por `@Roles('SUPERADMIN', 'ACCOUNTANT')`.
