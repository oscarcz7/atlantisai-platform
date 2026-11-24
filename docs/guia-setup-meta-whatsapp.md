# Guía Paso a Paso — Configuración de Meta / WhatsApp Cloud API (Fase 3)

Documento operativo para habilitar el canal de WhatsApp y los agentes de IA de la Plataforma NOAH, primero en **modo pruebas (gratis)** y luego en **producción (Edificio NOAH)**.

> **Principio multi-edificio (ADR-0005):** Todos los edificios viven bajo el mismo Portafolio Empresarial de Meta, pero cada edificio tiene su **propio número de WhatsApp** (`phone_number_id`). Así el backend identifica automáticamente a qué edificio escribe el residente.

---

## 1. Qué necesitas antes de empezar

### A. Para pruebas y desarrollo (hoy, sin costo)
- [ ] Cuenta de Facebook con acceso a **Meta Business Suite** (`https://business.facebook.com`).
- [ ] Cuenta de desarrollador en **Meta for Developers** (`https://developers.facebook.com`).
- [ ] Entre 1 y 5 números de WhatsApp de tu equipo para probar el bot.
- [ ] API Key del proveedor de IA (`LLM_PROVIDER` y `LLM_API_KEY`, ej. Gemini API o OpenAI).

### B. Para salir a producción en Edificio NOAH (iniciar trámites en paralelo)
- [ ] **Documentos para Business Verification:** RUC de la empresa, nombramiento/documento legal, sitio web con política de privacidad y correo corporativo del mismo dominio.
- [ ] **Línea telefónica nueva y dedicada para Edificio NOAH:**
  - **NO** puede estar registrada actualmente en WhatsApp personal ni en WhatsApp Business App.
  - Debe poder recibir **1 SMS o 1 llamada** de verificación al registrarla en Meta.
- [ ] **Perfil del edificio:** Nombre visible (*Display Name*, ej. `Edificio NOAH`) y logo cuadrado (mínimo 640×640 px).
- [ ] **Tarjeta corporativa** en Meta Business (las respuestas dentro de las 24 h iniciadas por el residente son **gratuitas**; solo se cobran las plantillas proactivas *Utility* fuera de esa ventana).

---

## 2. Parte A · Configuración de desarrollo y pruebas (~30 minutos)

### Paso 1 · Crear el Portafolio Empresarial en Meta Business Suite
1. Entra a `https://business.facebook.com/` y crea un **Portafolio empresarial** (Business Portfolio) con el nombre legal de tu empresa/administradora.
2. Verifica tu correo corporativo dentro de **Configuración del negocio → Información del negocio**.

### Paso 2 · Crear la App en Meta for Developers (con tu propia cuenta)
1. Entra a `https://developers.facebook.com/apps/` → **My Apps → Create App (Crear app)**.
2. Selecciona el caso de uso **Connect with customers through WhatsApp** (o tipo **Business** y agrega el producto **WhatsApp**) → **Next**.
3. Vincula tu **Meta Business Portfolio** (si no tienes uno, Meta te permite crearlo ahí mismo) → **Create App**.
4. Meta te llevará directo a **WhatsApp → API Setup (Quickstart)**.

### Paso 3 · Obtener el `WA_PHONE_NUMBER_ID` y registrar números de prueba
1. Ve a **WhatsApp → Configuración de la API (API Setup)**.
2. Meta te asigna automáticamente un **número de prueba**. Copia el campo **Identificador de número de teléfono** → ese es tu `WA_PHONE_NUMBER_ID`.
3. En **Para (To)** → **Administrar lista de números de teléfono**, agrega hasta 5 números de tu equipo (Meta enviará un código por WhatsApp para confirmar cada uno).
4. Haz clic en **Enviar mensaje** (`hello_world`) para confirmar que llega a tu WhatsApp.

### Paso 4 · Obtener el `WA_APP_SECRET`
1. Ve a **Configuración de la app → Básica (App Settings → Basic)**.
2. Muestra y copia **Clave secreta de la app (App Secret)** → ese es tu `WA_APP_SECRET` (lo usamos para validar la firma `X-Hub-Signature-256` de cada webhook entrante).

### Paso 5 · Generar un token permanente (`WA_ACCESS_TOKEN`) con System User
> **Importante:** El token de la pantalla *API Setup* caduca en 24 horas. Para no renovarlo a diario, crea un **System User**:
1. En **Meta Business Suite → Configuración del negocio → Usuarios → Usuarios del sistema (System Users)** → **Agregar**.
2. Crea un usuario (ej. `noah-platform-bot`) con rol **Administrador**.
3. En **Activos asignados (Assign Assets)**, asígnale:
   - Tu **App** de Meta (control total / administrar).
   - Tu **Cuenta de WhatsApp Business** (control total).
4. Haz clic en **Generar nuevo token**, selecciona tu App, marca vencimiento **Nunca** y selecciona los permisos:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
5. Copia el token generado → ese es tu `WA_ACCESS_TOKEN` *(guárdalo en Secret Manager / `.env`, nunca en Git)*.

### Paso 6 · Configurar el Webhook
1. Inventa una cadena aleatoria larga (ej. `openssl rand -hex 24`) → ese será tu `WA_VERIFY_TOKEN`.
2. Para recibir mensajes desde Meta necesitas una URL **HTTPS pública**:
   - **En staging (Cloud Run):** `https://api.<tu-dominio>/webhooks/whatsapp`
   - **En local (desarrollo):** levanta un túnel temporal hacia el puerto 4000, por ejemplo:
     ```bash
     npx cloudflared tunnel --url http://localhost:4000
     ```
     y usa `https://<subdominio>.trycloudflare.com/webhooks/whatsapp`.
3. En **Meta for Developers → Use cases → Customize → Configuration** (o **WhatsApp → Configuration**) → **Webhook → Edit**:
   - **Callback URL:** tu URL HTTPS `/webhooks/whatsapp`.
   - **Verify Token:** el valor exacto de `WA_VERIFY_TOKEN`.
   - Clic en **Verify and Save** (nuestro endpoint `GET /webhooks/whatsapp` responderá el reto automáticamente).
4. En **Webhook fields → Manage**, suscríbete al campo **`messages`**.

### Paso 7 · Variables listas para `.env` y Google Secret Manager
```bash
WA_PHONE_NUMBER_ID=...
WA_ACCESS_TOKEN=...
WA_APP_SECRET=...
WA_VERIFY_TOKEN=...
LLM_PROVIDER=gemini   # o openai / anthropic
LLM_API_KEY=...
```

---

## 3. Parte B · Preparación para Producción (Edificio NOAH)

Estos pasos se pueden iniciar **desde ya** porque Meta tarda entre 2 y 7 días hábiles en revisar documentos y plantillas:

### Paso 8 · Verificación del negocio (Business Verification)
1. En **Meta Business Suite → Centro de seguridad (Security Center)** → **Iniciar verificación**.
2. Sube el RUC y documento legal que muestre el nombre y dirección exacta de la empresa.
3. Completa la verificación de dominio/correo corporativo.

### Paso 9 · Método de pago
1. Ve a **WhatsApp Manager → Configuración de la cuenta → Configuración de pago (Billing)**.
2. Agrega la tarjeta corporativa.

### Paso 10 · Registrar el número real del Edificio NOAH
1. En **WhatsApp Manager → Números de teléfono → Agregar número de teléfono**.
2. Ingresa el nombre visible (`Edificio NOAH`), categoría (**Bienes raíces / Servicios residenciales**) y la **línea nueva dedicada**.
3. Completa la verificación por SMS o llamada.
4. Una vez aprobado, copia el nuevo **`phone_number_id`** de producción y guárdalo en la ficha del Edificio NOAH (en `Tenant.whatsappPhoneNumberId`).

### Paso 11 · Crear y aprobar las 7 plantillas (Categoría: `UTILITY`, Idioma: `es`)
En **WhatsApp Manager → Plantillas de mensajes (Message Templates)**, crea estas 7 plantillas (evita lenguaje promocional para que Meta las mantenga en categoría *Utilidad*):

| Nombre | Texto sugerido | Variables |
| --- | --- | --- |
| `account_statement_monthly` | `Hola {{1}}, tu estado de cuenta de {{2}} para la unidad {{3}} es de {{4}}. Puedes realizar tu transferencia a las cuentas oficiales del edificio y enviarnos el comprobante por este chat.` | `1`: nombre, `2`: mes, `3`: unidad, `4`: monto |
| `payment_receipt_issued` | `Hola {{1}}, tu pago de {{2}} (unidad {{3}}) fue aprobado. Comprobante de recaudación N.º {{4}}.` | `1`: nombre, `2`: monto, `3`: unidad, `4`: número |
| `reservation_reminder` | `Recordatorio: tu reserva de {{1}} inicia hoy a las {{2}} (unidad {{3}}). Recuerda respetar el aforo y las normas del Manual.` | `1`: área, `2`: hora, `3`: unidad |
| `reservation_confirmed` | `Hola {{1}}, tu reserva de {{2}} para el {{3}} de {{4}} a {{5}} quedó confirmada.` | `1`: nombre, `2`: área, `3`: fecha, `4`: inicio, `5`: fin |
| `guest_pass` | `Hola {{1}}, tienes un pase de acceso para {{2}} el {{3}} de {{4}} a {{5}}. Presenta el QR en el lector: {{6}}` | `1`: nombre, `2`: área/visita, `3`: fecha, `4`: inicio, `5`: fin, `6`: enlace |
| `incident_urgent_alert` | `ALERTA URGENTE — {{1}}: {{2}} en {{3}}. Reportado por unidad {{4}}. Ticket #{{5}}.` | `1`: edificio, `2`: categoría, `3`: ubicación, `4`: unidad, `5`: ticket |
| `ticket_resolved` | `Hola {{1}}, la incidencia #{{2}} ({{3}} en {{4}}) fue marcada como resuelta. Gracias por tu reporte.` | `1`: nombre, `2`: ticket, `3`: categoría, `4`: ubicación |

---

## 4. Qué debes solicitar a la empresa (listo para copiar y enviar)

Mientras tú desarrollas y pruebas el 100 % del bot con tu cuenta personal de pruebas, envía esta solicitud a gerencia/administración para que vayan tramitando los activos de producción:

1. **Portafolio Empresarial en Meta Business Suite (`https://business.facebook.com/`):**
   - Creado a nombre de la empresa dueña de la plataforma (o de Grupo Baluarte / Edificio NOAH) y con la **Verificación del negocio (*Business Verification*)** iniciada en *Business Settings → Security Center* (requiere RUC, documento legal, sitio web y correo corporativo del mismo dominio).
2. **Acceso de Administrador/Desarrollador para ti:**
   - Que te inviten por correo como administrador/desarrollador dentro de ese Portafolio Empresarial (así no usas tus datos ni tu tarjeta para producción).
3. **Método de pago en Meta Business:**
   - Tarjeta corporativa registrada en *WhatsApp Manager → Billing* (para las plantillas *Utility* fuera de la ventana de 24 h; las respuestas dentro de 24 h son gratuitas).
4. **Línea telefónica nueva y dedicada para Edificio NOAH:**
   - Número **sin WhatsApp personal ni WhatsApp Business App activo**, capaz de recibir 1 SMS o llamada de verificación.
   - Nombre visible oficial (`Edificio NOAH`) y logo cuadrado (mín. 640×640 px).
5. **Cuenta y API Key del proveedor de IA (`LLM_API_KEY`):**
   - Cuenta corporativa (Gemini API / OpenAI / Anthropic) para facturar el consumo de los agentes de IA.

---

## 5. Checklist de cierre para arrancar Fase 3 en local

Cuando tengas estos 5 datos de tu cuenta de pruebas listos, implementamos y probamos el módulo `messaging` + `ai` (orquestador y 4 agentes):
- [ ] `WA_PHONE_NUMBER_ID` (número de prueba de Meta)
- [ ] `WA_ACCESS_TOKEN` (temporal 24 h para probar hoy, o System User permanente)
- [ ] `WA_APP_SECRET`
- [ ] `WA_VERIFY_TOKEN`
- [ ] `LLM_PROVIDER` y `LLM_API_KEY`
