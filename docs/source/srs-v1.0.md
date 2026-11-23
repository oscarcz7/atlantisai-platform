# NOAH – Especificación de Requerimientos de Software

Nov 18, 2026 · @Oscar Catota · Versión 1.0

Este documento traduce el BRD y el Manual de Uso de Áreas Comunales del Edificio NOAH en requerimientos implementables. Se construye en tres etapas: primero el dashboard administrativo, luego la emisión de QR integrada con los lectores Hikvision y por último el canal de WhatsApp con agentes de IA. Las decisiones aún abiertas con el administrador se modelan como parámetros, de modo que no bloquean el desarrollo.

## 1. Alcance, principios y roles

### Alcance

Una plataforma multi-edificio con tres canales: un dashboard web para administración, contabilidad y guardianía; QR temporales validados por los lectores Hikvision de las áreas comunales; y un bot de WhatsApp con agentes de IA para residentes. El primer edificio es NOAH. Cualquier edificio nuevo se da de alta por configuración, sin cambiar código.

Quedan fuera de este alcance: pasarelas de pago, conciliación por API bancaria, facturación electrónica del SRI, lectura de placas y llamadas de voz. Se evalúan en la fase de escala.

### Principios de diseño

**Todo lo que varía entre edificios es un parámetro.** Aforos, horarios, cupos, tarifas, combos, roles por área, tolerancia de mora y plazos se guardan por edificio. Las preguntas abiertas con el administrador solo cambian valores, no código.

**El LLM interpreta, el código decide.** Los agentes de IA solo entienden lo que pide el residente y redactan respuestas. Toda validación, cobro, reserva o emisión de QR la ejecuta el backend con reglas determinísticas y auditables.

**El lector valida, la nube administra.** La validación del QR ocurre en el lector, sin depender de internet. La nube crea, revoca y audita las credenciales.

**Cada acción queda registrada.** Quién hizo qué, cuándo y desde qué canal, incluidas las aperturas remotas y los descuentos de garantía.

**El dashboard es la base.** Todo lo que haga el bot debe poder hacerse también desde el dashboard. Así la operación funciona desde la Fase 1 y el bot se suma después como un canal más.

### Roles

| Rol | Canal | Puede hacer |
| --- | --- | --- |
| SuperAdmin | Dashboard | Alta de edificios, clonación de configuración, usuarios internos, lectura de bitácoras de todo el sistema. |
| Administrador de edificio | Dashboard | Configuración del edificio, catastro, contratos, reservas, garantías y sus descuentos, incidencias, apertura remota. |
| Contador | Dashboard | Bandeja contable, aprobación de pagos, estados de cuenta y comprobantes de recaudación. Sin acceso a la operación de accesos. |
| Guardia | Consola de garita | Visitas esperadas, parqueaderos, registro de invitados extra, bitácora de accesos, apertura de emergencia. |
| Propietario residente | WhatsApp | Reservas en las 11 áreas, visitas, pagos, incidencias, consultas. |
| Propietario arrendador (renta fija) | WhatsApp | Consulta de alícuotas y garantía. Sin uso de áreas mientras dure el arriendo. |
| Arrendatario fijo | WhatsApp | Mismos permisos de uso que un propietario residente durante su contrato. |
| Propietario anfitrión Airbnb | WhatsApp | Registro de huéspedes. Uso de áreas según la regla que confirme el administrador (pregunta 1.5). |
| Huésped Airbnb | WhatsApp | Consulta de normas y reservas en las 7 áreas permitidas, solo durante su estancia. |

Los permisos de cada rol por área se configuran en la matriz de acceso del edificio. Para NOAH se carga la tabla del Manual.

## 2. Arquitectura y stack tecnológico

&#91;embedded content: arquitectura · nube, edificio y canales\]

El backend es un monolito modular: un solo servicio desplegable con módulos bien separados. Es más simple de operar que microservicios para el tamaño actual y se puede dividir más adelante si un módulo lo necesita. Los agentes de IA nunca escriben en la base de datos directamente: llaman a las mismas funciones del backend que usa el dashboard, y el motor de reglas decide.

El Edge Gateway es un mini PC en la red del edificio. Abre un túnel cifrado hacia la nube, por lo que no requiere IP pública ni abrir puertos. Recibe órdenes de crear o revocar credenciales, las aplica en los lectores por ISAPI, guarda en cola lo que no pudo enviar si se cae internet y reenvía a la nube cada lectura de QR.

### Stack

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Backend | Node.js + NestJS + TypeScript | Módulos por dominio, validación con DTOs, OpenAPI generado. |
| ORM y migraciones | Prisma | Esquema versionado, migraciones en CI. |
| Dashboard | Next.js + TypeScript | Componentes compartidos; consola de garita con actualizaciones en tiempo real (WebSocket). |
| Base de datos | PostgreSQL 16 + pgvector | Cada tabla lleva `tenant_id` con Row-Level Security. pgvector guarda los fragmentos del Manual para el RAG. |
| Colas y caché | Redis + BullMQ | Envío de mensajes, sincronización con lectores, tareas programadas (purga nocturna, estados de cuenta). |
| Archivos | Almacenamiento compatible con S3 | Comprobantes, fotos de incidencias, PDF de recibos. URLs firmadas de corta duración. |
| Autenticación | JWT + segundo factor (TOTP) | Solo para usuarios del dashboard; los residentes se identifican por su número de WhatsApp. |
| Edge Gateway | Node.js en mini PC (Linux) | Cliente ISAPI, cola local, túnel saliente (WireGuard o WebSocket seguro). |
| WhatsApp | Meta WhatsApp Cloud API | Webhook en el backend; un número por edificio. |
| IA | Proveedor LLM vía API | Detrás de una interfaz propia para poder cambiar de proveedor o modelo sin tocar los agentes. |
| Infraestructura | Contenedores en la nube, región costa este de EE. UU. | Terraform para la infraestructura; ambientes de desarrollo, staging y producción. |
| CI/CD | GitHub Actions | Pruebas, migraciones y despliegue automático a staging. |
| Observabilidad | Logs centralizados + Sentry + monitoreo de disponibilidad | Alertas de lector desconectado, gateway sin conexión y cola de mensajes atascada. |

## 3. Modelo de datos principal

Todas las entidades, salvo las globales del SaaS, llevan `tenant_id` (el edificio). Las fechas se guardan en UTC y se muestran en la hora de Ecuador (America/Guayaquil).

| Grupo | Entidad | Qué guarda |
| --- | --- | --- |
| SaaS | Edificio (tenant) | Nombre, RUC, logo, número de WhatsApp, contactos de guardianía y administración, horarios de atención, zona horaria. |
| SaaS | Usuario interno | Usuarios del dashboard, su rol (SuperAdmin, Admin, Contador, Guardia) y los edificios a los que tiene acceso. |
| Configuración | Parámetros del edificio | Garantía, tolerancia de mora, anticipación general, plazo para enviar comprobante, tarifas de invitados extra, tarifa de parqueadero. |
| Configuración | Tipología | Estudio, Suite, Departamento: invitados incluidos por reserva. |
| Configuración | Área comunal | Aforo, duración máxima, horario, frecuencia y su periodo, anticipación, si es compartida o exclusiva, si aplica cupos, si requiere garantía, costo de limpieza, si tiene lector. |
| Configuración | Matriz de acceso | Qué rol puede usar qué área. |
| Configuración | Combo de limpieza | Conjunto de áreas y su tarifa combinada. |
| Configuración | Lector | Modelo, serie, IP, firmware, área o áreas que controla, estado de conexión. |
| Configuración | Parqueadero de visitas | Puestos, tiempo gratuito, tarifa por hora o fracción. |
| Configuración | Documento de conocimiento | Manual y reglamento en PDF, con sus fragmentos indexados para el RAG. |
| Catastro | Unidad | Número, piso, tipología, alícuota mensual. |
| Catastro | Persona | Nombre, cédula (cifrada), teléfono de WhatsApp, correo, consentimiento de datos. |
| Catastro | Ocupación | Relación persona–unidad con su rol y vigencia: propietario residente, arrendador, arrendatario fijo, anfitrión, huésped. Activa y desactiva permisos por fecha. |
| Reservas | Reserva | Unidad, persona, área o combo, inicio y fin, asistentes declarados, estado, cobros asociados. |
| Reservas | Asistente | Cada persona de la reserva, con su credencial. |
| Accesos | Credencial | Código del QR, lector o lectores, vigencia, aperturas máximas, estado de sincronización (pendiente, cargada, revocada, error). |
| Accesos | Evento de acceso | Lectura en el lector: credencial, resultado, fecha y hora. |
| Visitas | Visita | Anfitrión, datos del visitante, placa, si usa parqueadero, entrada y salida registradas por el guardia. |
| Finanzas | Movimiento de cuenta | Cargo o abono a una unidad: alícuota, limpieza, invitados, parqueadero, daño, pago. |
| Finanzas | Garantía | Saldo de garantía por unidad y su historial de depósitos y descuentos. |
| Finanzas | Comprobante de pago | Imagen o PDF, datos leídos (banco, monto, fecha, referencia), estado de revisión, contador que aprobó. |
| Finanzas | Comprobante de recaudación | PDF emitido con numeración secuencial por edificio. |
| Incidencias | Ticket | Categoría, ubicación, urgencia, estado, fotos, personas suscritas al cierre. |
| Conversación | Conversación y mensaje | Historial por número de WhatsApp, agente que atendió, estado de la ventana de 24 horas. |
| Auditoría | Registro de auditoría | Toda acción sensible: quién, qué, cuándo, canal, valores antes y después. Solo inserción. |

## 4. Módulos del dashboard

Cada módulo indica en qué fase se construye. En la Fase 1 el administrador y el guardia operan todo desde el dashboard; en las fases siguientes el mismo módulo recibe datos de los lectores y del bot.

### 4.1 Acceso y usuarios internos · Fase 1

- Inicio de sesión con correo y contraseña, segundo factor obligatorio y recuperación de cuenta.
- Alta, edición y baja de usuarios internos con su rol y los edificios que pueden ver.
- Selector de edificio para quienes administran más de uno.
- Cierre de sesión por inactividad y registro de cada inicio de sesión.

### 4.2 Configurador del edificio · Fase 1

- Datos generales: nombre, RUC, logo, cuentas bancarias, contactos, horarios de atención y zona horaria.
- Parámetros financieros: garantía, tolerancia de mora, tarifas de invitados extra, plazo para enviar comprobantes.
- Tipologías con sus invitados incluidos.
- Catálogo de áreas con todas sus reglas (ver Modelo de datos) y la matriz de acceso por rol.
- Combos de limpieza: el sistema elige automáticamente el combo correcto cuando una reserva incluye varias áreas.
- Parqueaderos de visitas.
- Carga de documentos de conocimiento (Manual, reglamento) para el RAG; se indexan en la Fase 3.
- Clonar la configuración de un edificio a otro, para que la alta de un edificio nuevo tome minutos.
- Todo cambio de parámetro queda en auditoría y aplica solo a reservas nuevas.

### 4.3 Catastro y ocupaciones · Fase 1

- Unidades con tipología, piso y alícuota.
- Personas con datos de contacto, cédula y registro de consentimiento.
- Ocupaciones con fecha de inicio y fin: al vencer un contrato de arriendo o una estancia Airbnb, los permisos se desactivan solos.
- Al registrar un arrendatario fijo, el propietario pasa automáticamente a arrendador y pierde el uso de áreas mientras dure el contrato.
- Importación desde Excel con validación previa (filas con error se muestran antes de guardar).
- Ficha de unidad: ocupantes, saldo, garantía, reservas, visitas e incidencias en una sola vista.

### 4.4 Reservas y calendario maestro · Fase 1

- Calendario por área y vista unificada de todo el edificio, por día y semana.
- Creación de reservas desde el dashboard en nombre de un residente, pasando por el motor de reglas (sección 5). El sistema muestra por qué rechaza una reserva.
- Bloqueo de cruces en combos: reservar BBQ + Lounge ocupa ambas áreas.
- Estados de una reserva: pendiente de pago, en revisión, confirmada, cancelada, vencida, completada.
- Liberación automática de reservas pendientes de pago cuando vence el plazo.
- Bloqueos administrativos de un área (mantenimiento, eventos del edificio).
- En la Fase 2, cada reserva confirmada emite sus QR (sección 6).

### 4.5 Estados de cuenta y garantías · Fase 1

- Cuenta corriente por unidad: alícuotas, limpieza, invitados extra, parqueadero, daños y pagos.
- Generación mensual de alícuotas.
- Cálculo de meses vencidos y bloqueo automático de reservas según la tolerancia configurada.
- Garantía por unidad: depósitos, descuentos por daño con motivo y evidencia, y bloqueo de reservas mientras el saldo no esté completo.
- Exportación a Excel para el contador.

### 4.6 Bandeja contable · Fase 1 (lectura con IA en Fase 3)

- Cola de comprobantes pendientes, visible solo para el contador.
- Vista dividida: imagen del comprobante a un lado y estado de cuenta de la unidad al otro.
- En la Fase 1 el contador o el administrador sube el comprobante y digita banco, monto, fecha y referencia. En la Fase 3 la IA llena estos campos y el contador solo confirma.
- Aprobar o rechazar con motivo. Al aprobar: se registra el pago, se levantan bloqueos si corresponde, se confirma la reserva asociada y se emite el comprobante de recaudación en PDF.
- Alerta de comprobante posiblemente duplicado (misma referencia, monto y fecha).

### 4.7 Consola de garita · Fase 1 (accesos en vivo en Fase 2)

- Pantalla para tablet o PC pensada para uso rápido.
- Visitas esperadas del día, con búsqueda por nombre, cédula o placa.
- Registro de entrada y salida de visitas; si usa parqueadero, se asigna puesto y arranca el cronómetro.
- Los 4 puestos de visitas con su tiempo transcurrido: amarillo al acercarse a las 3 horas, rojo al superarlas. Al registrar la salida se genera el cargo por exceso.
- Registro de invitados no declarados en una reserva, con el recargo correspondiente (sujeto a la decisión del administrador).
- Huéspedes Airbnb activos.
- En la Fase 2: lecturas de QR en vivo, aforo estimado por área y botón de apertura remota de emergencia con motivo obligatorio.

### 4.8 Incidencias · Fase 1 (deduplicación con IA en Fase 3)

- Tickets con categoría, ubicación, urgencia, fotos y responsable.
- Estados: abierto, en proceso, resuelto, cerrado.
- Aviso de posible duplicado al crear un ticket en la misma ubicación y categoría en las últimas 48 horas.
- Personas suscritas que reciben aviso al cierre (por WhatsApp desde la Fase 3).

### 4.9 Monitor de lectores · Fase 2

- Estado de cada lector y del gateway: conectado, sin conexión, última sincronización.
- Credenciales cargadas en cada lector y su capacidad usada (máximo 3.000 usuarios por equipo).
- Reintento manual de sincronizaciones fallidas.
- Alertas por lector o gateway desconectado.

### 4.10 Auditoría y reportes · Fase 1

- Bitácora filtrable por usuario, acción, unidad y fecha.
- Reportes básicos: uso por área, ocupación, ingresos por concepto, morosidad, incidencias por categoría.
- Exportación a Excel.

## 5. Motor de reservas

Es el núcleo del sistema y se construye en la Fase 1. El dashboard y el bot lo llaman igual. Cada validación devuelve un código de rechazo y un mensaje claro, para que el administrador o el bot expliquen al residente qué falta.

### Orden de validaciones

1. **Persona y ocupación activa:** la persona tiene una ocupación vigente en una unidad.
2. **Rol permitido en el área:** según la matriz de acceso (por ejemplo, un huésped no puede reservar BBQ).
3. **Suspensión administrativa:** la unidad no tiene una sanción vigente.
4. **Mora:** los meses vencidos no superan la tolerancia del edificio.
5. **Garantía:** si el área la requiere, la unidad tiene el saldo completo.
6. **Horario del área:** el bloque cae dentro del horario operativo y no supera la duración máxima.
7. **Anticipación:** se cumple la regla general o la excepción de 1 hora, según el tipo de área.
8. **Frecuencia:** la unidad no superó su límite en la semana o el mes calendario.
9. **Disponibilidad:** en áreas exclusivas, que no exista otra reserva en ese horario (incluidas las áreas de un combo); en áreas compartidas, que la suma de asistentes no supere el aforo.
10. **Aforo de la reserva:** los asistentes declarados no superan el aforo del área.

La disponibilidad y el aforo se comprueban dentro de una transacción con bloqueo, para que dos personas no tomen el último cupo al mismo tiempo.

### Cálculo de cobros

**Invitados extra:** solo en áreas que aplican cupos. Extra = asistentes declarados − (1 residente + invitados incluidos de la tipología). Cada extra declarado cuesta USD 5,00.

**Limpieza:** si la reserva incluye varias áreas con limpieza, se aplica el combo que corresponda; si no, la suma individual.

**Ejemplo:** una Suite reserva Gimnasio para 5 personas. Incluye 1 + 3 = 4, así que hay 1 extra: USD 5,00. El Gimnasio no tiene limpieza. Total: USD 5,00.

### Estados de la reserva

| Estado | Cuándo | Qué pasa |
| --- | --- | --- |
| Pendiente de pago | Requiere pago previo (limpieza). | El espacio queda retenido hasta que venza el plazo para enviar el comprobante. |
| En revisión | Llegó el comprobante. | El espacio sigue retenido hasta que el contador decida. |
| Confirmada | Pago aprobado o reserva sin pago previo. | Se emiten los QR (desde la Fase 2). |
| Cancelada | La cancela el residente o el administrador. | Se revocan los QR y se aplica la regla de reembolso que defina el administrador. |
| Vencida | Venció el plazo sin comprobante. | Se libera el espacio. |
| Completada | Terminó el horario. | Se purgan los QR y se cierran los registros de asistencia. |

## 6. Módulo de acceso QR e integración con lectores

Se construye en la Fase 2, después de la prueba de concepto con un lector real. Lo que sigue es el diseño esperado; los detalles marcados como «a confirmar» dependen de las respuestas del instalador y de la PoC.

### Cómo funciona una credencial

Para el lector, cada QR es un usuario con una ventana de vigencia y un número de tarjeta. El lector lee el QR, compara su contenido con los números de tarjeta que tiene guardados y abre si la hora actual está dentro de la vigencia. No necesita internet para esto.

- **Contenido del QR:** un código aleatorio único, sin datos personales. Formato y longitud a confirmar con el firmware.
- **Una credencial por persona:** cada asistente de la reserva recibe su propio QR.
- **Vigencia:** desde el inicio de la reserva menos un margen de entrada configurable (por ejemplo, 10 minutos) hasta el fin de la reserva.
- **Aperturas máximas:** si el firmware lo permite, se limita el número de veces que cada QR abre la puerta. A confirmar en la PoC.
- **Combos:** una reserva de BBQ + Lounge carga la misma credencial en los lectores de ambas áreas.

### Ciclo de vida

| Momento | Acción del sistema |
| --- | --- |
| Reserva confirmada | Crea las credenciales y envía la orden al gateway, que las carga en el lector o lectores. |
| Carga exitosa | La credencial pasa a «cargada» y el QR se entrega al residente. |
| Carga fallida | Reintentos automáticos. Si sigue fallando cerca del inicio de la reserva, alerta en el monitor y en la consola de garita. |
| Lectura del QR | El lector abre y registra el evento; el gateway lo envía a la nube para la asistencia y el aforo estimado. |
| Reserva cancelada | Orden de revocar las credenciales en los lectores. |
| Fin de la reserva | El lector deja de aceptarlas por vigencia; la purga nocturna las borra del equipo. |

### Edge Gateway

- Mantiene una conexión saliente y cifrada con la nube; no requiere IP pública.
- Recibe órdenes (crear, revocar, consultar) con un identificador único, para que un reintento nunca duplique una credencial.
- Habla con cada lector por ISAPI en la red local. Los recursos exactos de la API se toman de la guía ISAPI del firmware instalado.
- Recibe los eventos de lectura de los lectores en tiempo real.
- Si se cae internet, guarda en cola los eventos y los envía al volver la conexión. Los lectores siguen validando las credenciales ya cargadas.
- Sirve la hora a los lectores (NTP) para que la vigencia sea exacta.
- Reporta su estado y el de cada lector cada minuto.

**Límite a tener en cuenta:** si internet se cae antes de que una credencial llegue al lector, esa credencial no existe en el equipo. Por eso se cargan en cuanto se confirma la reserva, no justo antes de que empiece. Si aun así no llega, el guardia puede abrir de forma remota o manual.

### Entrega del QR

**Fase 2 (sin bot):** cada asistente tiene un pase digital: una página web con el QR, el área, la fecha y las normas, a la que se accede con un enlace firmado y con vencimiento. El administrador copia el enlace y lo envía por WhatsApp o correo. La página no requiere instalar nada ni iniciar sesión.

**Fase 3 (con bot):** el bot envía el QR o el enlace del pase directamente por WhatsApp.

### Capacidad y transición

- Cada lector admite hasta 3.000 usuarios. Gracias a la purga nocturna, en NOAH se espera un uso muy inferior; el monitor muestra el uso por equipo.
- Durante la transición, los tags físicos actuales pueden convivir con los QR en el mismo lector. Las credenciales del sistema se identifican con un prefijo propio para no borrar tags ajenos.

## 7. Canal WhatsApp y agentes de IA

Se construye en la Fase 3. Para entonces el motor de reservas, las finanzas, las visitas, las incidencias y los QR ya funcionan desde el dashboard; el bot es un canal más que usa esas mismas funciones.

### Canal

- Un número por edificio. El backend identifica el edificio por el número que recibe el mensaje y a la persona por el número que escribe.
- Un número desconocido recibe un mensaje de bienvenida y se le pide contactar a la administración; no accede a ninguna información.
- Interacción híbrida: texto libre, listas desplegables para el menú principal y botones de confirmación. Para formularios (lista de invitados, registro de visita o huésped) se usan WhatsApp Flows o un enlace web firmado.
- Dentro de las 24 horas desde el último mensaje del residente, el bot responde libremente. Fuera de esa ventana solo puede enviar plantillas aprobadas.
- Bandeja de conversaciones en el dashboard: el administrador ve los chats y puede tomar el control de una conversación; mientras lo hace, el bot no responde en ese chat.

### Orquestador

- Carga en cada mensaje el contexto de la persona: edificio, unidad, rol, mora, garantía y conversación reciente.
- Clasifica la intención y la deriva al agente correspondiente. Si la persona cambia de tema, la deriva a otro agente sin perder el contexto.
- Si no entiende el pedido después de dos intentos, muestra el menú principal.
- Escala a un humano cuando la persona lo pide, cuando hay una emergencia o cuando un agente no puede resolver.

### Agentes

| Agente | Qué hace | Funciones del backend que puede usar |
| --- | --- | --- |
| Reservas | Entiende el pedido (área, fecha, hora, asistentes), consulta disponibilidad, muestra el desglose de cobros, pide confirmación con botón, solicita comprobante si aplica y entrega los QR. También consulta y cancela reservas. | Consultar disponibilidad, simular reserva, crear reserva, cancelar reserva, obtener pases QR. |
| Visitas y accesos | Registra visitas y huéspedes Airbnb mediante formulario, revisa parqueaderos disponibles, emite el pase y avisa a garita. | Registrar visita, consultar parqueaderos, registrar estancia Airbnb, obtener pase de visita. |
| Financiero | Informa saldos y garantía. Recibe fotos o PDF de transferencias, lee banco, monto, fecha y referencia, y los envía a la bandeja contable. Entrega el comprobante de recaudación cuando se aprueba. | Consultar estado de cuenta, registrar comprobante, consultar estado de un comprobante. |
| Incidencias y normas | Responde dudas sobre el reglamento citando la sección del Manual. Recibe reportes con texto y fotos, detecta duplicados, suscribe al vecino al cierre y escala emergencias a guardianía y administración. | Buscar en el Manual, crear ticket, buscar tickets abiertos, suscribirse a un ticket, enviar alerta urgente. |

### Reglas para los agentes

- Solo actúan a través de las funciones del backend y con los permisos de la persona que escribe. No pueden ver datos de otras unidades.
- Ningún cobro, reserva o cancelación se ejecuta sin un botón de confirmación del residente.
- Las respuestas sobre normas se basan solo en el Manual cargado. Si la respuesta no está ahí, lo dicen y ofrecen contactar a la administración.
- El texto dentro de imágenes o documentos que envía un residente se trata como dato, nunca como instrucción.
- Si el proveedor de IA no responde, el bot pasa a un modo de menú con botones que permite reservar, pagar y reportar sin IA.
- Cada conversación guarda qué agente atendió, qué funciones llamó y su resultado, para auditoría y mejora.
- El proveedor y el modelo se configuran detrás de una interfaz propia, para poder cambiarlos o usar modelos distintos por tarea (por ejemplo, uno rápido para clasificar y otro para leer comprobantes).

## 8. Flujos de extremo a extremo

Cada flujo se describe en su versión final, con el bot. La última línea indica cómo se opera en las fases anteriores.

### A. Reserva sin pago previo (Gimnasio, Coworking)

1. El residente pide: «Gimnasio hoy de 19:00 a 21:00 para 5 personas».
2. El agente de reservas llama al motor, que valida y calcula: Suite, 4 incluidos, 1 extra, USD 5,00.
3. El residente recibe el desglose y confirma con un botón.
4. Se crea la reserva confirmada, se carga el cargo a la cuenta de la unidad y se emiten 5 credenciales.
5. El gateway las carga en el lector del Gimnasio y el residente recibe los 5 pases.

Fase 1: el administrador crea la reserva en el dashboard. Fase 2: además se emiten los QR y el administrador envía los enlaces de los pases.

### B. Reserva con limpieza (combo BBQ + Lounge)

1. El propietario pide BBQ + Lounge para el sábado de 13:00 a 19:00.
2. El motor valida ambas áreas, la frecuencia mensual, el rol y la garantía, y aplica el combo de USD 50,00.
3. La reserva queda pendiente de pago y el bot muestra las cuentas bancarias.
4. El residente envía la foto de la transferencia; la IA lee los datos y la reserva pasa a en revisión.
5. El contador aprueba en la bandeja: se registra el pago, se emite el comprobante de recaudación, se confirma la reserva y se emiten los QR para ambos lectores.
6. El bot entrega el comprobante y los pases (o el mecanismo para invitados que elija el administrador).

Fase 1: el administrador sube el comprobante y el contador lo aprueba en el dashboard.

### C. Pago de alícuota

1. A inicio de mes el sistema envía por plantilla el estado de cuenta con las cuentas bancarias.
2. El residente responde con el comprobante; la IA lo lee y lo envía a la bandeja contable.
3. El contador aprueba: se actualiza el saldo, se levantan bloqueos por mora si corresponde y el bot entrega el comprobante de recaudación.

Fase 1: el estado de cuenta se consulta y exporta desde el dashboard; los comprobantes llegan por los canales actuales y se cargan a mano.

### D. Visita con parqueadero

1. El residente elige «Registrar visita» y llena el formulario: nombre, cédula, placa y si necesita parqueadero.
2. El sistema revisa los 4 puestos, emite el pase y la visita aparece en la consola de garita.
3. El guardia registra la entrada; arranca el cronómetro.
4. Al registrar la salida, si pasó de 3 horas, se carga USD 1,50 por hora o fracción a la unidad.

Fase 1: el guardia o el administrador registra la visita en el dashboard.

### E. Huésped Airbnb

1. El anfitrión registra al huésped (nombre, teléfono, check-in, check-out) antes de entregar las llaves.
2. El sistema crea una ocupación de huésped con vigencia hasta el check-out.
3. El huésped puede escribir al bot para consultar normas y reservar en las 7 áreas permitidas.
4. Al check-out, la ocupación vence y sus credenciales dejan de funcionar.

Fase 1: el administrador registra la estancia en el catastro.

### F. Incidencia

1. El residente reporta con texto y foto.
2. La IA clasifica categoría, ubicación y urgencia, y busca tickets abiertos similares de las últimas 48 horas.
3. Si hay duplicado: informa el número de ticket y ofrece avisarle al cierre.
4. Si es nuevo: crea el ticket. Si es urgente, alerta de inmediato a guardianía y administración, a cualquier hora.

Fase 1: los tickets se registran en el dashboard y el sistema advierte posibles duplicados.

## 9. Requisitos no funcionales

| Tema | Requisito |
| --- | --- |
| Rendimiento | Dashboard: páginas en menos de 2 segundos. Bot: respuesta en menos de 5 segundos en el 90 % de los casos; botones y menús, en menos de 2. |
| Disponibilidad | Nube: 99,5 % mensual. El acceso a las áreas con QR ya cargados no depende de la nube. |
| Tiempo de carga de QR | Una credencial confirmada llega al lector en menos de 1 minuto cuando hay conexión. |
| Seguridad | HTTPS en todo, cifrado de datos en reposo, cédulas cifradas a nivel de campo, segundo factor en el dashboard, secretos en un gestor, enlaces firmados con vencimiento. |
| Aislamiento | Ningún usuario ni agente puede leer datos de otro edificio (Row-Level Security y pruebas automáticas que lo verifiquen). |
| Protección de datos | Consentimiento registrado por persona, acceso mínimo por rol, política de retención y borrado según lo que defina el abogado. |
| Auditoría | Toda acción sensible queda registrada sin posibilidad de edición. |
| Respaldos | Diarios, con restauración a un punto en el tiempo de al menos 7 días; prueba de restauración trimestral. |
| Observabilidad | Logs centralizados, errores en Sentry, alertas por lector, gateway, colas y webhook de WhatsApp. |
| Calidad | Pruebas unitarias del motor de reglas con cada caso del Manual; pruebas de extremo a extremo de los flujos A a F antes de cada versión. |
| Idioma y zona horaria | Español; hora de Ecuador; moneda USD con dos decimales. |
| Escalabilidad | Un edificio nuevo se da de alta por configuración y clonación, sin desplegar código. |

## 10. Fases de implementación

&#91;embedded content: fases de implementación · duración estimada, no a escala\]

Las duraciones suponen un equipo de 2 a 3 desarrolladores y son estimaciones a ajustar al cerrar la Fase 0. En total, unas 18 semanas hasta terminar el piloto. Dos trabajos corren en paralelo: la prueba de concepto con un lector real, durante la Fase 1, y la cuenta de Meta con su verificación, desde la Fase 1 hasta antes del piloto.

### Fase 0 · Base técnica (1 semana)

**Objetivo:** que el equipo pueda desarrollar y desplegar desde el primer día.

- Repositorio monorepo (backend, dashboard, gateway, librerías compartidas) y convenciones de código.
- Infraestructura como código: ambientes de desarrollo, staging y producción, base de datos, Redis, almacenamiento y gestor de secretos.
- CI/CD con pruebas, migraciones y despliegue automático a staging.
- Esquema base multi-tenant con Row-Level Security y la prueba que verifica el aislamiento entre edificios.
- Observabilidad básica: logs, Sentry y monitoreo de disponibilidad.

**Criterio de salida:** un cambio pasa de un commit a staging de forma automática.

### Fase 1 · Dashboard y motor de reglas (5 semanas)

**Objetivo:** que la administración de NOAH opere reservas, finanzas, visitas e incidencias desde el dashboard, sin QR ni bot.

- Módulos 4.1 a 4.8 y 4.10: usuarios internos, configurador, catastro, reservas, estados de cuenta y garantías, bandeja contable manual, consola de garita sin accesos en vivo, incidencias, auditoría.
- Motor de reservas completo con pruebas automatizadas por cada regla del Manual.
- Configuración de NOAH cargada como edificio semilla, con los valores del Manual y las respuestas del administrador.
- Importación del catastro desde Excel.
- Comprobante de recaudación en PDF.

**Depende de:** respuestas del administrador para los valores; el desarrollo no se detiene porque todo es parametrizable.

**Criterio de salida:** el administrador y el contador ejecutan los flujos A a F en staging con datos reales de NOAH.

**En paralelo:** prueba de concepto con un lector real (una semana), siguiendo el plan del documento para el instalador.

### Fase 2 · QR e integración con lectores (4 semanas)

**Objetivo:** que cada reserva confirmada genere QR que abran la puerta correcta solo en su horario.

- Edge Gateway: túnel, cliente ISAPI, cola local, NTP, reporte de estado.
- Ciclo de vida de credenciales: creación, carga, revocación, purga nocturna y reintentos.
- Recepción de lecturas, asistencia por reserva y aforo estimado.
- Pase digital con enlace firmado.
- Monitor de lectores (4.9) y accesos en vivo en la consola de garita, con apertura remota.
- Instalación del gateway en NOAH y prueba en uno o dos lectores antes de extender al resto.

**Depende de:** PoC aprobada, credenciales de los lectores, acceso a la red del edificio y el gateway instalado.

**Criterio de salida:** durante una semana, todas las reservas de las áreas con lector se operan con QR en paralelo con los tags.

### Fase 3 · WhatsApp y agentes de IA (5 semanas)

**Objetivo:** que los residentes hagan por WhatsApp todo lo que hoy hace el administrador por ellos.

- Webhook de WhatsApp, identificación por número, menú, botones y formularios.
- Orquestador y los 4 agentes, en este orden: reservas, visitas, financiero, incidencias y normas.
- Indexación del Manual para el RAG.
- Lectura de comprobantes con IA en la bandeja contable.
- Plantillas aprobadas: estado de cuenta, comprobante emitido, recordatorio, pase, alerta urgente.
- Bandeja de conversaciones con toma de control humana.
- Modo de menú sin IA como respaldo.
- Conjunto de conversaciones de prueba por agente para medir aciertos antes de cada cambio de prompt o modelo.

**Depende de:** cuenta de Meta con número de prueba (desde la Fase 1) y, para salir a residentes, el número real registrado.

**Criterio de salida:** el conjunto de pruebas de conversación pasa con la tasa de acierto que se defina, y ningún cobro ni reserva se ejecuta sin confirmación.

### Fase 4 · Piloto en NOAH (3 semanas)

**Objetivo:** validar con usuarios reales antes de abrir a todo el edificio.

- Semana 1: 5 a 10 unidades voluntarias, con soporte cercano.
- Semana 2: ajustes y apertura a todas las unidades; retiro gradual de los tags.
- Semana 3: estabilización, capacitación a guardias y contador, y cierre del piloto.

**Criterio de salida:** acordado con la gerencia antes de empezar (por ejemplo, porcentaje de reservas hechas por WhatsApp, cero accesos fallidos por credenciales no cargadas y tiempo de aprobación de pagos).

### Fase 5 · Escala SaaS (posterior)

- Alta de un segundo edificio por clonación para validar el modelo multi-tenant.
- Pasarelas de pago, conciliación bancaria por API y facturación electrónica si el contador lo requiere.
- Lectura de placas en parqueaderos y llamadas de voz para cobranza.
- Portal de autogestión para que cada administradora configure sus edificios.
