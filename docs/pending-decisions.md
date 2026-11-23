# Decisiones pendientes y cerradas

Valores que dependen del Manual de Uso de Áreas Comunales, el administrador de NOAH, el contador o el abogado. Cada punto abierto tiene un parámetro y un valor provisional para no bloquear el desarrollo.

Las preguntas abiertas listas para enviar por responsable están separadas en [`docs/open-questions-by-owner.md`](open-questions-by-owner.md).

---

## Decisiones cerradas (confirmadas con el Manual)

| ID | Tema | Decisión confirmada | Fuente | Parámetro |
| --- | --- | --- | --- | --- |
| P-02 (base) | Acceso de anfitrión Airbnb durante renta corta | El huésped accede a las 7 áreas permitidas; el propietario anfitrión puede usar las 4 áreas prohibidas al huésped (Home Cine, Lounge, Salón Comunal, BBQ). *(Matiz pendiente: confirmar si sin huésped activo usa las 11).* | Manual §10 (pág. 11) | `AmenityAccessRule` + lógica de ocupación |
| P-04 (parcial) | ¿Área Lúdica se reserva? | **No**, es de uso libre (`FREE_USE`), máximo 2 horas. *(Pet Zone sigue abierto por ambigüedad del Manual).* | Manual §5.6 (pág. 7) | `amenity.mode = FREE_USE` |
| P-07 | Aviso corto (1 h) en áreas compartidas | **Permitido** sujeto a disponibilidad y aforo máximo (explícito en §3.7 y en Salas de reuniones). | Manual §3.6–3.7 (pág. 1) y §5.1 (pág. 4) | `advancePolicy = SHORT_NOTICE_ALLOWED` |
| P-08 | ¿Cupos por tipología en Salas de reuniones? | **No aplican** (el Manual no asigna cupos ni recargo por extra en esta área). | Manual §5.1 (pág. 4) | `amenity.appliesGuestQuota = false` |
| P-09 | Quién deposita la garantía con arrendatario fijo | **El propietario** (por unidad); permanece congelada mientras propietario o arrendatario usen áreas. | Manual §4 (pág. 2) y §10 (pág. 12) | `DepositAccount` por unidad |
| P-14 (limpieza) | Reembolso del valor de limpieza al cancelar | **No es reembolsable.** *(Sigue abierto solo el plazo mínimo de anticipación para cancelar).* | Manual §4 consid. 6 (pág. 3) | `cancellationPolicy.cleaningFeeHandling = NON_REFUNDABLE` |

---

## Decisiones abiertas (con valor provisional)

| ID | Responsable | Tema | Valor provisional | Parámetro |
| --- | --- | --- | --- | --- |
| P-01 | Administrador | ¿Garantía de USD 200 aplica a todas las áreas reservables (§4) o solo a las que requieren limpieza (§3.8)? | Solo áreas con limpieza | `amenity.requiresDeposit` |
| P-02 (matiz) | Administrador | Cuando un inmueble Airbnb **no** tiene huésped activo, ¿el propietario anfitrión puede usar las 11 áreas o solo las 4 exclusivas? | Las 11 áreas sin huésped activo | Lógica de ocupación |
| P-03 | Administrador | Meses de mora en alícuotas tolerados antes de bloquear reservas | 2 meses | `arrearsToleranceMonths` |
| P-04 (Pet Zone) | Administrador | Pet Zone: el Manual dice «Uso libre» y a la vez «reservas todos los días». ¿Requiere reserva o es uso libre? | Uso libre (`FREE_USE`) | `amenity.mode` |
| P-05 | Administrador | Salas de reuniones (12 pers., 6 por área de trabajo): ¿se reserva completa o como 2 salas de 6? | Sala completa, compartida | `amenity.mode`, `capacity` |
| P-06 | Administrador | Horarios operativos de Área Húmeda, Lúdica, Play Zone, Cine, Lounge, Salón y BBQ (no constan en el Manual) | 08:00–22:00 | `amenity.schedule` |
| P-07 (exclusivas) | Administrador | El Manual menciona 1 h de anticipación excepcional incluso en Cine/Lounge/Salón/BBQ (con limpieza previa). ¿Se habilita aviso corto en esas áreas o solo con 24 h? | 24 h (`GENERAL`) en áreas con limpieza | `amenity.advancePolicy` |
| P-10 | Administrador | Mecanismo de cobro de los USD 10 por invitado no declarado | Registro por guardia, cargo a la cuenta de la unidad | Flujo en `visits` |
| P-11 | Admin / Contador | Plazo máximo para enviar el comprobante de pago de limpieza antes de liberar la reserva | 240 minutos (4 h) | `paymentProofDeadlineMinutes` |
| P-12 | Admin / Contador | ¿Los USD 5 por invitado extra declarado se pagan antes o se cargan a la cuenta mensual de la unidad? | Cargo a la cuenta de la unidad | Flujo de reserva |
| P-13 | Admin / Contador | Aprobación de comprobantes fuera del horario del contador (fines de semana / noches) | Reserva queda en `IN_REVIEW` hasta el siguiente día hábil | Lógica de plazos |
| P-14 (plazo) | Administrador | Anticipación mínima para cancelar una reserva (la limpieza ya está confirmada como no reembolsable) | 24 horas antes | `cancellationPolicy.minHoursBefore` |
| P-15 | Administrador | Ingreso de invitados en eventos grandes (Salón Comunal / BBQ) al migrar de tags a QR | QR individual por invitado | Lógica de `access` |
| P-16 | Administrador | Margen de entrada antes del inicio de la reserva para activar el QR | 10 minutos | `entryMarginMinutes` |
| P-17 | Administrador | «Todos los días» (Coworking, Gimnasio, Play Zone): ¿máximo 1 reserva diaria por unidad o varias? | 1 por día | `amenity.frequency` |
| P-18 | Administrador | Airbnb (§6 del Manual): ¿en la nueva plataforma el huésped registrado puede reservar directo por WhatsApp o solo el anfitrión antes de entregar llaves? | Huésped reserva en sus 7 áreas tras ser registrado por el anfitrión | Reglas de `AIRBNB_GUEST` |
| L-01 | Contador / Abogado | ¿Limpieza, invitados extra y exceso de parqueadero requieren factura electrónica del SRI o basta con comprobante de recaudación? | Comprobante de recaudación | Módulo `billing` |
| L-02 | Abogado | Responsable del tratamiento de datos personales y política de retención/borrado (LOPDP Ecuador) | Por definir | Política de retención |
