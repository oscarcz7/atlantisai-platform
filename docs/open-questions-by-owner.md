# Preguntas abiertas por responsable — Edificio NOAH

Este documento separa únicamente las preguntas que **no quedaron cerradas** tras revisar el *Manual de Uso de Áreas Comunales*, agrupadas por responsable para gestionarlas y cerrarlas antes del piloto. Mientras se reciben respuestas, el sistema usa los valores provisionales documentados en [`pending-decisions.md`](pending-decisions.md).

---

## 1. Para el Administrador de NOAH (Grupo Baluarte — Arq. Damián Álvarez)

1. **[P-01] Alcance de la garantía (USD 200):** El §4 indica garantía para «áreas bajo modalidad de reserva» y el §3.8 dice «en áreas que así lo requieran». ¿Se exigirá garantía para **todas** las áreas reservables o solo para las 4 con limpieza (Home Cine, Lounge, Salón Comunal, BBQ)?
2. **[P-02] Anfitrión Airbnb sin huésped activo:** Confirmado por §10 que durante renta corta el anfitrión usa las 4 áreas prohibidas al huésped. Cuando la unidad **no** tiene un huésped alojado, ¿el anfitrión puede usar las 11 áreas o mantiene la restricción?
3. **[P-03] Tolerancia de mora:** ¿Con cuántos meses vencidos de alícuota se bloquean las reservas de áreas comunales? *(Provisional: 2 meses).*
4. **[P-04] Pet Zone:** El §5.3 indica «Uso libre» y también «reservas todos los días». ¿Pet Zone requiere reserva previa en plataforma o es de uso libre como el Área Lúdica?
5. **[P-05] Salas de reuniones:** El aforo es de 12 personas («6 personas por área de trabajo»). ¿Se modela como **2 salas independientes** de 6 personas o como **1 sola área compartida** de 12 personas?
6. **[P-06] Horarios operativos faltantes:** El Manual no especifica horarios de apertura y cierre para: **Área Húmeda, Área Lúdica, Play Zone, Home Cine, Área Lounge, Salón Comunal y Zona BBQ**. ¿Cuáles son sus horarios oficiales? *(Provisional: 08:00–22:00).*
7. **[P-07] Aviso corto (1 hora) en áreas con limpieza:** El Manual menciona la excepción de 1 hora incluso en Cine, Lounge, Salón y BBQ, pero estas requieren pago previo de limpieza. ¿Se mantiene anticipación mínima de **24 horas** en esas 4 áreas o se habilita también la excepción de 1 hora?
8. **[P-10] Cobro de invitados no declarados (USD 10):** Cuando el guardia detecta invitados extra no declarados, ¿se registra en garita para cargarlo automáticamente a la cuenta mensual de la unidad o se exige pago inmediato?
9. **[P-14] Plazo mínimo de cancelación:** Confirmado que la limpieza **no es reembolsable**. ¿Con cuántas horas de anticipación mínima se puede cancelar una reserva? *(Provisional: 24 horas).*
10. **[P-15] Ingreso de invitados en eventos grandes (Salón Comunal / BBQ):** Al reemplazar los tags físicos por QR, ¿prefieren QR individual por invitado o un mecanismo distinto para grupos grandes (30–50 personas)?
11. **[P-16] Margen de entrada del QR:** ¿Cuántos minutos antes de la hora de inicio debe habilitarse el acceso? *(Provisional: 10 minutos).*
12. **[P-17] Límite diario en Coworking, Gimnasio y Play Zone:** Cuando el Manual dice «todos los días», ¿es máximo **1 reserva al día** por unidad o pueden hacer varias el mismo día?
13. **[P-18] Flujo de reservas Airbnb (§6):** El Manual actual indica que el anfitrión debe gestionar la reserva antes de entregar llaves al huésped. Con la nueva plataforma, ¿el huésped registrado por el anfitrión podrá reservar directamente por WhatsApp en sus 7 áreas permitidas, o solo el anfitrión podrá reservar por él?

---

## 2. Para el Contador (junto con el Administrador)

1. **[P-11] Plazo para enviar comprobante de limpieza:** ¿Cuánto tiempo tiene el residente desde que solicita una reserva con limpieza para enviar la transferencia antes de liberar el espacio? *(Provisional: 4 horas).*
2. **[P-12] Momento de cobro de invitados extra declarados (USD 5):** ¿Se pagan por adelantado antes de confirmar la reserva o se cargan a la cuenta corriente/alícuota mensual de la unidad? *(Provisional: a la cuenta de la unidad).*
3. **[P-13] Comprobantes fuera de horario laboral:** Si un residente envía un comprobante de limpieza en la noche o fin de semana, ¿la reserva queda retenida «en revisión» hasta el siguiente día hábil?
4. **[L-01] Comprobante tributario:** Los cobros de limpieza, invitados extra y exceso de parqueadero de visitas, ¿requieren factura electrónica del SRI o se manejan con comprobante de recaudación interno del condominio?

---

## 3. Para el Abogado (LOPDP Ecuador)

1. **[L-02] Protección de datos personales (LOPDP):**
   - ¿Quién figura legalmente como responsable del tratamiento de datos (el Condominio Edificio NOAH o la administradora Grupo Baluarte)?
   - ¿Cuál es el plazo de retención y política de borrado para cédulas, registros de visitas, eventos de acceso QR e historial de WhatsApp?
2. **[L-01] Validación legal/tributaria:** Confirmar junto al contador si los conceptos adicionales (limpieza, extras, parqueadero) están exentos de facturación SRI bajo régimen de propiedad horizontal.

---

## 4. Para el Instalador / PoC de lectores Hikvision (antes de Fase 2)

*(Detalle técnico en [`docs/integrations/hikvision.md`](integrations/hikvision.md))*

1. Inventario de lectores instalados (`DS-K1T344EBFWX-E1`): serie, IP en VLAN, versión de firmware y área asignada para completar `seed/noah.config.json`.
2. Guía oficial ISAPI del firmware instalado y préstamo/acceso a un equipo para la PoC (validar QR como número de tarjeta, longitud máxima, límite de aperturas y comportamiento offline).
