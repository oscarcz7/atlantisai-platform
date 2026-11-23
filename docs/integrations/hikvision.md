# Integración con lectores Hikvision DS-K1T344EBFWX-E1

## Lo que sabemos del equipo (ficha técnica)

- Lectura de QR con la cámara; también rostro, tarjeta EM 125 kHz, PIN y huella.
- Capacidad: 3.000 usuarios, 3.000 tarjetas, 150.000 eventos.
- Una salida de cerradura, entrada de sensor de puerta, botón de salida, RS-485, Wiegand de entrada.
- Red cableada 10/100 o Wi-Fi; PoE 802.3at; sincronización de hora.
- IP65.

## Lo que se confirma en la PoC (no asumir antes)

- Que el QR se valida como número de tarjeta asociado a un usuario con vigencia.
- Formato y longitud máxima del contenido del QR.
- Si se puede limitar el número de aperturas por usuario.
- Comportamiento offline con credenciales ya cargadas.
- Recursos y campos exactos de ISAPI en el firmware instalado.

## Modelo de credencial

Para el lector, cada QR es un **usuario** con ventana de vigencia + una **tarjeta** cuyo número es el contenido del QR.

- `employeeNo` del usuario: prefijo del sistema + id corto de la credencial (p. ej. `NX` + base36). El prefijo permite distinguir credenciales propias de tags existentes y nunca borrar lo ajeno.
- Número de tarjeta = `Credential.code`: aleatorio criptográfico, sin datos personales, longitud según firmware.
- Vigencia: `validFrom = reserva.inicio − entryMarginMinutes`, `validTo = reserva.fin`, en hora local del lector.

## Edge Gateway (`apps/gateway`)

Responsabilidades:
1. Túnel saliente seguro hacia la API (WebSocket sobre TLS con token de dispositivo, o WireGuard).
2. Consumir `GatewayCommand` y aplicarlos por ISAPI con autenticación Digest sobre HTTPS.
3. Responder `ack` con resultado; reintentos con backoff; idempotencia por `idempotencyKey`.
4. Suscribirse a los eventos de cada lector y reenviarlos como `AccessEvent`.
5. Cola local persistente (SQLite) para eventos y acks cuando no hay internet.
6. Servidor NTP local o configuración NTP de los lectores.
7. Heartbeat cada 60 s con estado del gateway y de cada lector.

Interfaz interna obligatoria:

```ts
interface AccessControlDevice {
  upsertCredential(c: { employeeNo: string; cardNo: string; validFrom: Date; validTo: Date; maxOpens?: number }): Promise<void>;
  revokeCredential(employeeNo: string): Promise<void>;
  listCredentials(prefix: string): Promise<string[]>;
  getStatus(): Promise<{ online: boolean; firmware?: string; userCount?: number }>;
  subscribeEvents(onEvent: (e: RawAccessEvent) => void): () => void;
}
```

Implementaciones: `HikvisionIsapiDevice` (real) y `FakeDevice` (pruebas y desarrollo). Toda la lógica del gateway se prueba contra `FakeDevice`.

## Referencia ISAPI (confirmar con la guía del firmware)

Los recursos usados habitualmente para control de acceso en terminales Hikvision son del tipo:
- Alta y edición de usuarios con vigencia (`/ISAPI/AccessControl/UserInfo/...`).
- Alta de tarjetas asociadas a un usuario (`/ISAPI/AccessControl/CardInfo/...`).
- Borrado de usuarios (`/ISAPI/AccessControl/UserInfoDetail/...`).
- Flujo de eventos (`/ISAPI/Event/notification/alertStream`) o envío de eventos a un servidor HTTP configurado en el equipo.

Antes de implementar cada llamada, verifica el recurso, los campos y la versión en la guía ISAPI entregada por el distribuidor para este modelo y firmware. Marca con `TODO(isapi)` lo no confirmado.

## Ciclo de vida

| Evento | Acción |
| --- | --- |
| Reserva confirmada | `UPSERT_CREDENTIAL` a cada lector del área o combo |
| Ack OK | `Credential.syncStatus = LOADED` → pase disponible |
| Fallo | Reintentos; si `PENDING` a menos de 30 min del inicio → alerta en monitor y garita |
| Reserva cancelada / ocupación vencida | `REVOKE_CREDENTIAL` |
| Diario 03:00 | `PURGE`: borrar credenciales del prefijo vencidas hace más de 1 h |
| Lectura | `AccessEvent` → asistencia y aforo estimado |

## Seguridad

- Red de lectores en VLAN propia; el gateway es el único con acceso a ella.
- Credenciales de administrador de los lectores en el almacén cifrado del gateway, nunca en la nube en texto plano.
- El gateway nunca acepta conexiones entrantes desde internet.
