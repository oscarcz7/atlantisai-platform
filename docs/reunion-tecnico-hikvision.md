# Documento Técnico de Reunión y PoC — Integración Hikvision DS-K1T344EBFWX-E1

**Proyecto:** Plataforma de Gestión Residencial — Edificio NOAH (Fase 2: Acceso QR + Edge Gateway)  
**Objetivo de la reunión:** Confirmar la arquitectura de red local, validar por pruebas reales el comportamiento del firmware sobre **ISAPI** y recopilar los parámetros exactos para implementar `HikvisionIsapiDevice` (`apps/gateway`) y completar `seed/noah.config.json`.

---

## 1. Arquitectura técnica de integración (referencia para explicar al técnico)

```text
┌─────────────────────────────────────┐
│        Nube (Google Cloud)          │
│  apps/api (NestJS + PostgreSQL RLS) │
│  - Genera código QR aleatorio       │
│  - Encola GatewayCommand            │
└──────────────────▲──────────────────┘
                   │ Túnel saliente WSS/TLS (puerto 443)
                   │ Autenticado con token del edificio
                   │ (NO requiere IP pública ni port-forwarding)
┌──────────────────┴──────────────────┐
│  Mini PC Linux en rack de NOAH      │
│  apps/gateway (Docker 24/7)         │
│  - Cola local SQLite (offline)      │
│  - Cliente ISAPI (HTTP Digest)      │
│  - Servidor/cliente NTP             │
└──────────────────┬──────────────────┘
                   │ Red local / VLAN lectores (cableado)
        ┌──────────┼──────────┐
        ▼          ▼          ▼
  [Lector 1]  [Lector 2]  [Lector N]
  DS-K1T344EBFWX-E1 (validación QR 100 % offline)
```

- **Regla de seguridad:** el Mini PC (`apps/gateway`) **solo** abre conexiones salientes hacia internet; los lectores permanecen aislados en la red interna del edificio.
- **Convivencia con tags actuales (EM 125 kHz):** todas las credenciales creadas por nuestra plataforma usarán un prefijo exclusivo en `employeeNo` (ej. `NX...`). La purga nocturna **jamás** tocará usuarios sin ese prefijo.

---

## 2. Cuestionario técnico de bajo nivel para el técnico

### A. Red, VLAN y ubicación del Mini PC (Edge Gateway)
1. **Topología de red:** ¿Todos los lectores están en la misma subred/VLAN cableada? ¿Cuál es el rango de red (ej. `192.168.X.0/24`), máscara y gateway?
2. **IPs de los lectores:** ¿Tienen IP estática o DHCP con reserva?
3. **Ubicación del Mini PC:** ¿Existe ya una PC/servidor en esa red o podemos instalar un Mini PC Linux dedicado en el rack/switch de los lectores?
   - Confirmar disponibilidad de: **1 puerto Ethernet libre en el switch de lectores**, **toma eléctrica (ideal con UPS)** y **salida a internet por puerto 443 (HTTPS/WSS)**.
4. **NTP (sincronización de hora):** ¿Los lectores tienen salida a un servidor NTP o pueden sincronizar hora contra nuestro Mini PC? *(Crítico: un desfase > 30 s rompe la vigencia exacta de los QR).*

### B. Acceso al equipo, protocolo y seguridad
5. **Versión exacta de firmware** instalada en los `DS-K1T344EBFWX-E1` y entrega de la **Guía oficial ISAPI** correspondiente.
6. **Protocolo local:** ¿ISAPI está habilitado sobre **HTTPS (443)** o **HTTP (80)**? ¿Utiliza **HTTP Digest Auth** estándar con el usuario `admin` (o un usuario operador dedicado)?
7. **Gestión actual:** ¿Los lectores están actualmente vinculados a HikCentral, iVMS-4200 o Hik-Connect? Confirmar si operar por ISAPI local genera algún conflicto con el software actual.

### C. Modelo de credencial QR y capacidades del firmware
8. **Modo de lectura QR:** ¿La cámara del lector está habilitada para leer códigos QR? ¿Valida el contenido del QR directamente contra el campo `cardNo` de `CardInfo` asociado a un `UserInfo`?
9. **Formato y longitud de `cardNo` para QR:**
   - ¿Acepta solo dígitos (`0-9`) o alfanumérico (`A-Z0-9`)?
   - ¿Longitud mínima y máxima permitida? (ej. 8–20 caracteres).
   - ¿El lector espera QR en texto plano o requiere algún encabezado/cifrado propietario de Hikvision?
10. **Formato de `employeeNo`:** ¿Acepta prefijo alfanumérico (ej. `NX0001` o `NX` + base36, máx. 32 caracteres) sin colisionar con la numeración de los tags actuales?
11. **Ventana de vigencia (`Valid`):** ¿Soporta `beginTime` y `endTime` a nivel de minuto/segundo (ej. `2026-11-24T15:00:00`, `timeType: "local"`) y respeta exactamente la hora local del equipo?
12. **Límite de aperturas (`maxOpenDoorTime` / `doorRight`):** ¿El firmware permite limitar cuántas veces puede abrir la puerta un usuario temporal (ej. 2 o 4 aperturas), o solo controla por fecha/hora de vigencia?
13. **Capacidad y purga:** Confirmar límite de **3.000 usuarios / 3.000 tarjetas** y cómo consultar el conteo actual de usuarios cargados para el Monitor de Lectores.

### D. Eventos de acceso en tiempo real y apertura remota
14. **Recepción de lecturas (eventos):** ¿Cuál mecanismo funciona mejor en este firmware para enviar lecturas al Mini PC?
    - **Opción A (push):** Configurar *HTTP Listening Host* en el lector apuntando a la IP local del Mini PC.
    - **Opción B (stream):** Suscripción persistente vía `/ISAPI/Event/notification/alertStream`.
    - **Opción C (polling respaldo):** Consulta por rango de fechas vía `/ISAPI/AccessControl/AcsEvent?format=json`.
15. **Apertura remota de emergencia (Consola de garita):** Confirmar el recurso ISAPI para abrir la cerradura remotamente (habitualmente `PUT /ISAPI/AccessControl/RemoteControl/door/1` con `<cmd>open</cmd>`).

---

## 3. Comandos `curl` de referencia para la PoC en vivo

> **Nota:** Ajustar `READER_IP`, `USER` y `PASS` con los datos del equipo de prueba. Si usa HTTPS con certificado autofirmado, agregar `-k` y cambiar `http://` por `https://`. Todos los recursos se confirman contra la guía ISAPI del firmware.

### 3.1 Verificar información del equipo y firmware
```bash
curl --digest -u admin:PASSWORD "http://READER_IP/ISAPI/System/deviceInfo"
```

### 3.2 Consultar capacidades y conteo de usuarios actuales
```bash
curl --digest -u admin:PASSWORD "http://READER_IP/ISAPI/AccessControl/UserInfo/Count?format=json"
```

### 3.3 Crear usuario temporal `NX0001` con vigencia de 10 minutos
```bash
curl --digest -u admin:PASSWORD -X POST \
  "http://READER_IP/ISAPI/AccessControl/UserInfo/Record?format=json" \
  -H "Content-Type: application/json" \
  -d '{
    "UserInfo": {
      "employeeNo": "NX0001",
      "name": "QR Prueba NOAH",
      "userType": "normal",
      "Valid": {
        "enable": true,
        "beginTime": "2026-11-24T10:05:00",
        "endTime": "2026-11-24T10:15:00",
        "timeType": "local"
      },
      "doorRight": "1",
      "RightPlan": [{ "doorNo": 1, "planTemplateNo": "1" }]
    }
  }'
```

### 3.4 Asociar el código del QR como tarjeta (`cardNo`) al usuario `NX0001`
```bash
curl --digest -u admin:PASSWORD -X POST \
  "http://READER_IP/ISAPI/AccessControl/CardInfo/Record?format=json" \
  -H "Content-Type: application/json" \
  -d '{
    "CardInfo": {
      "employeeNo": "NX0001",
      "cardNo": "1234567890",
      "cardType": "normalCard"
    }
  }'
```
*(Luego generar un QR de texto plano con `1234567890` en el celular y presentarlo a la cámara del lector).*

### 3.5 Revocar / eliminar usuario temporal `NX0001`
```bash
curl --digest -u admin:PASSWORD -X PUT \
  "http://READER_IP/ISAPI/AccessControl/UserInfoDetail/Delete?format=json" \
  -H "Content-Type: application/json" \
  -d '{
    "UserInfoDetail": {
      "mode": "byEmployeeNo",
      "EmployeeNoList": [{ "employeeNo": "NX0001" }]
    }
  }'
```

### 3.6 Probar apertura remota de emergencia
```bash
curl --digest -u admin:PASSWORD -X PUT \
  "http://READER_IP/ISAPI/AccessControl/RemoteControl/door/1" \
  -H "Content-Type: application/xml" \
  -d '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>'
```

---

## 4. Matriz de validación de la PoC (marcar en la reunión)

| # | Prueba | Resultado esperado | Estado | Observaciones / Payload real |
| --- | --- | --- | --- | --- |
| P1 | Alta de `NX0001` + `cardNo` por ISAPI | HTTP 200 (`statusCode: 1`) | [ ] OK / [ ] Falla | |
| P2 | Escaneo QR **antes** de `beginTime` | Puerta **NO** abre (denegado por vigencia) | [ ] OK / [ ] Falla | |
| P3 | Escaneo QR **dentro** de `beginTime–endTime` | Puerta **SÍ** abre + evento registrado | [ ] OK / [ ] Falla | |
| P4 | Escaneo QR **después** de `endTime` | Puerta **NO** abre | [ ] OK / [ ] Falla | |
| P5 | Desconectar internet y escanear QR vigente | Puerta **SÍ** abre (100 % offline) | [ ] OK / [ ] Falla | |
| P6 | Borrar `NX0001` vigente y volver a escanear | Puerta **NO** abre de inmediato | [ ] OK / [ ] Falla | |
| P7 | Pasar tag físico EM 125 kHz de un residente | Sigue abriendo normal (sin afectación) | [ ] OK / [ ] Falla | |
| P8 | Verificar recepción del evento en red local | Evento llega con `employeeNo` / `cardNo` / hora | [ ] OK / [ ] Falla | |
| P9 | Probar apertura remota por ISAPI | Cerradura abre y registra evento | [ ] OK / [ ] Falla | |

---

## 5. Hoja de captura de datos (insumo directo para desarrollo de Fase 2)

### 5.1 Parámetros técnicos confirmados
- **Versión de firmware confirmada:** `_______________________`
- **Protocolo ISAPI (HTTP / HTTPS) y puerto:** `_______________________`
- **Formato exacto de `cardNo` para QR (solo dígitos / alfanumérico, min–max):** `_______________________`
- **Prefijo `employeeNo` acordado (ej. `NX`):** `_______________________`
- **¿Soporta límite de aperturas por usuario? (Sí/No + campo):** `_______________________`
- **Mecanismo de eventos elegido (HTTP Listening / alertStream / polling):** `_______________________`
- **Subred VLAN de lectores y gateway:** `_______________________`
- **Servidor NTP disponible:** `_______________________`
- **¿Se instala Mini PC dedicado nuestro? (Sí/No + ubicación rack):** `_______________________`
- **Guía ISAPI entregada (Sí/No / fecha):** `_______________________`

### 5.2 Inventario de lectores para `seed/noah.config.json` (`readers[]`)

| Código de área (`seed`) | Área comunal | Modelo | Serie | IP local | Firmware | Puerta (`doorNo`) |
| --- | --- | --- | --- | --- | --- | --- |
| `COWORKING` | Zona Coworking | | | | | |
| `MEETING_ROOMS` | Salas de reuniones | | | | | |
| `GYM` | Gimnasio | | | | | |
| `WET_AREA` | Área Húmeda (Piscina) | | | | | |
| `PLAY_ZONE` | Play Zone | | | | | |
| `HOME_CINEMA` | Home Cine | | | | | |
| `LOUNGE` | Área Lounge | | | | | |
| `COMMUNITY_HALL` | Salón Comunal | | | | | |
| `BBQ` | Zona BBQ | | | | | |

---

## 6. Siguiente paso al volver de la reunión

Con la sección **5** completa:
1. Volcamos el inventario en `seed/noah.config.json` (`readers[]`).
2. Implementamos `apps/gateway` (`HikvisionIsapiDevice` + `FakeDevice` + cola SQLite + túnel WSS saliente + NTP) y el módulo `access` en `apps/api` (ciclo de vida de credenciales, pases digitales `/passes/:token`, Monitor de Lectores y eventos en vivo en la consola de garita).
