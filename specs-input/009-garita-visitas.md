# 009 · Consola de garita y visitas

## Para /speckit.specify
Registro de visitas esperadas, entrada/salida en garita, asignación de los puestos de parqueadero de visitas con cronómetro visual (amarillo cerca de 3 h, rojo al superarlas) y generación automática de cargo por exceso (`C04`) al registrar salida. Registro de invitados no declarados con recargo `C02`.

## Para /speckit.plan
Módulo `visits` con tabla `visits` (RLS forzado, cédula cifrada/enmascarada), usando `calculateParkingOvertime` de `@noah/rules` y escribiendo `LedgerEntry(PARKING_OVERTIME | EXTRA_GUEST)`. Consola táctil en `/dashboard/garita`.
