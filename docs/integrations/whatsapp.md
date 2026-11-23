# Integración con WhatsApp Cloud API

## Modelo

- Un número por edificio, todos bajo el mismo portafolio empresarial de Meta.
- El tenant se identifica por `metadata.phone_number_id` del webhook; la persona, por `wa_id` (E.164 sin «+»).
- Desarrollo con el número de prueba de Meta (hasta 5 destinatarios registrados). Producción con el número real tras registrarlo.

## Webhook

1. `GET /webhooks/whatsapp`: verificación con `hub.verify_token`.
2. `POST /webhooks/whatsapp`: validar `X-Hub-Signature-256` con el app secret → responder 200 de inmediato → encolar en `wa-inbound`.
3. Worker: deduplicar por `message.id`, resolver tenant y persona, actualizar `Conversation.lastInboundAt`, pasar al orquestador.
4. Los estados de entrega (`statuses`) se guardan para métricas y reintentos.

## Envío

- Dentro de las 24 h desde el último mensaje del usuario: mensajes libres (texto, imagen, documento, interactivos).
- Fuera de esa ventana: solo plantillas aprobadas. El servicio `MessagingService.send()` decide automáticamente y falla si se intenta un mensaje libre fuera de ventana.
- Interactivos: `list` para el menú principal (máx. 10 opciones), `button` para confirmar o cancelar (máx. 3 botones), WhatsApp Flows o enlace firmado para formularios.
- Cola `wa-outbound` con límite de velocidad y reintentos con backoff ante errores 5xx o de límite.

## Plantillas (categoría utilidad)

| Nombre | Uso |
| --- | --- |
| `account_statement_monthly` | Estado de cuenta y cuentas bancarias |
| `payment_receipt_issued` | Comprobante de recaudación aprobado |
| `reservation_reminder` | Recordatorio antes de la reserva |
| `reservation_confirmed` | Confirmación fuera de la ventana de 24 h |
| `guest_pass` | Pase QR para un invitado o visita |
| `incident_urgent_alert` | Alerta a guardianía y administración |
| `ticket_resolved` | Aviso de cierre a suscriptores |

Los textos se versionan en `apps/api/src/modules/messaging/templates/` y se registran en Meta por script.

## Consentimiento

Una persona solo recibe plantillas si tiene `consentAt` registrado y no pidió la baja. Las palabras «baja» o «stop» la registran y se confirma por mensaje.

## Seguridad

- Token de acceso de usuario del sistema en el gestor de secretos.
- Archivos recibidos se descargan con el token y se guardan en el almacenamiento propio; nunca se reenvía la URL de Meta.
- El contenido de imágenes y documentos se trata como dato, nunca como instrucción para los agentes.
