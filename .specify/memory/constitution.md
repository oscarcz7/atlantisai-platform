# Constitución del proyecto — Plataforma de Gestión Residencial

Principios no negociables. Toda especificación, plan, tarea e implementación debe cumplirlos. `/speckit.analyze` marca como crítico cualquier incumplimiento. Para cambiar un principio se requiere un ADR y una nueva versión de este documento.

## I. Multi-tenant por defecto
Toda tabla de negocio tiene `tenant_id` y una política de Row-Level Security activa y forzada. Toda consulta se ejecuta dentro de un contexto de tenant (`withTenant`). Ningún usuario, proceso ni agente puede leer o escribir datos de otro edificio. Existe una prueba automática que verifica el aislamiento y otra que falla si una tabla con `tenant_id` no tiene política.

## II. Configuración, no código
Todo valor que pueda variar entre edificios (aforos, horarios, duraciones, frecuencias, tarifas, cupos, combos, roles por área, garantía, mora, plazos) se guarda en la configuración del edificio. Está prohibido escribir en el código valores propios de NOAH. Un edificio nuevo se da de alta sin desplegar código.

## III. Reglas determinísticas y probadas
Las reglas de reservas y cobros viven en `packages/rules`, una librería pura sin I/O, con el tiempo inyectado. Cada regla de `docs/business-rules.md` tiene al menos una prueba que la acepta y una que la rechaza. Los rechazos devuelven un código estable y un mensaje en español.

## IV. El LLM interpreta, el código decide
Los agentes de IA solo clasifican, extraen datos y redactan. Todo efecto (reservar, cobrar, cancelar, emitir credenciales, crear tickets) ocurre en servicios del backend, con los permisos de la persona, y requiere confirmación explícita del residente cuando implica dinero o reservas. El contenido de imágenes y documentos es dato, nunca instrucción.

## V. Una sola lógica para todos los canales
El dashboard, la consola de garita y el bot llaman a los mismos servicios. No hay lógica de negocio en controladores, en componentes de frontend ni en prompts. El frontend nunca calcula totales ni valida reglas: usa endpoints de simulación.

## VI. Dinero y tiempo exactos
Los montos se guardan como enteros en centavos de USD. Las fechas se guardan en UTC y se muestran en la zona horaria del edificio. Los rangos de reserva son semiabiertos `[inicio, fin)`. Las operaciones que cambian dinero, cupos o credenciales son transaccionales e idempotentes.

## VII. Trazabilidad
Toda acción sensible (cobros, pagos, descuentos de garantía, cambios de configuración, aprobaciones, aperturas remotas, cambios de permisos) queda en un registro de auditoría de solo inserción con actor, canal, valores antes y después.

## VIII. Privacidad y seguridad
Cumplimiento de la Ley Orgánica de Protección de Datos Personales del Ecuador. Cédulas cifradas a nivel de campo, teléfonos enmascarados en logs, sin datos personales ni secretos en logs. Secretos solo en Secret Manager. Segundo factor obligatorio en el dashboard. Archivos solo por URL firmada de corta duración. Consentimiento registrado antes de enviar mensajes.

## IX. Especificación antes que código
Ninguna funcionalidad se implementa sin una especificación aprobada con criterios de aceptación verificables. Si una regla no está definida, se crea un parámetro con valor provisional y se registra en `docs/pending-decisions.md`; nunca se inventa en silencio.

## X. Simplicidad operativa
Monolito modular, servicios administrados y la menor cantidad de piezas que cumpla el requerimiento. Toda dependencia externa (proveedor LLM, lectores, WhatsApp, colas) va detrás de una interfaz propia con una implementación falsa para pruebas.

## XI. Calidad en cada cambio
Pull request obligatorio con CI verde: lint, typecheck, pruebas unitarias e integración. Los flujos de extremo a extremo se ejecutan antes de cada versión. La documentación de `docs/` se actualiza en el mismo pull request que cambia una regla o decisión.

## XII. Idioma
Código, identificadores y commits en inglés. Textos de usuario, mensajes del bot, especificaciones y documentación en español.

---
Versión 1.0.0 · Ratificada: 2026-11-21
