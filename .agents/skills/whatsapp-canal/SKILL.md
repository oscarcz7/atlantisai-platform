---
name: whatsapp-canal
description: Cómo implementar el canal de WhatsApp Cloud API: webhook, verificación de firma, identificación de edificio y persona, ventana de 24 horas, mensajes interactivos, plantillas, archivos recibidos y consentimiento. Úsalo siempre que una tarea toque el módulo messaging, mensajes al residente, plantillas, notificaciones por WhatsApp o el número del bot.
---

# Canal WhatsApp

## Antes de empezar
Lee `docs/integrations/whatsapp.md`.

## Reglas
- El webhook valida `X-Hub-Signature-256` antes de cualquier otra cosa, responde 200 de inmediato y encola. Nunca procesa lógica dentro de la petición HTTP.
- Deduplicar por `message.id` (Meta reintenta entregas).
- Tenant por `metadata.phone_number_id`; persona por `wa_id`. Un número desconocido recibe el mensaje de bienvenida y no accede a datos.
- Todo envío pasa por `MessagingService.send(ctx, to, message)`, que:
  - Revisa la ventana de 24 h con `Conversation.lastInboundAt`.
  - Fuera de ventana, solo acepta plantillas; si recibe un mensaje libre, lanza `OUTSIDE_SERVICE_WINDOW`.
  - Revisa consentimiento antes de enviar plantillas.
  - Encola en `wa-outbound` con reintentos.
- Límites de interactivos: lista ≤ 10 filas, botones ≤ 3, títulos de botón ≤ 20 caracteres.
- Archivos recibidos: descargar con el token, validar tipo y tamaño, guardar en el almacenamiento propio, registrar `fileKey`.
- Teléfonos en formato E.164; enmascarados en logs.
- Textos al usuario en español, en `apps/api/src/modules/messaging/copy.es.ts`, nunca dispersos en el código.

## Desarrollo local
- Número de prueba de Meta y túnel HTTPS hacia la API local para recibir el webhook.
- `pnpm wa:simulate --from 5939XXXXXXXX --text "hola"` inyecta un mensaje sin pasar por Meta (útil para evals).

## Pruebas
- Firma inválida → 401 sin encolar.
- Mensaje duplicado → se procesa una sola vez.
- Envío libre fuera de ventana → error; plantilla fuera de ventana → OK.
- Persona sin consentimiento → no recibe plantillas.
