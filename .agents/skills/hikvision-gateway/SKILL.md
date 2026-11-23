---
name: hikvision-gateway
description: Cómo desarrollar el Edge Gateway y el módulo de accesos: credenciales QR temporales, órdenes al gateway, cliente ISAPI de los lectores Hikvision DS-K1T344EBFWX-E1, eventos de acceso, purga y funcionamiento sin internet. Úsalo siempre que una tarea toque apps/gateway, el módulo access, credenciales, QR, pases digitales, lectores o aperturas remotas.
---

# Edge Gateway y credenciales QR

## Antes de empezar
Lee `docs/integrations/hikvision.md` completo. Distingue lo confirmado por la ficha técnica de lo que depende de la PoC.

## Reglas
- Toda interacción con un lector pasa por la interfaz `AccessControlDevice`. Desarrolla y prueba contra `FakeDevice`; `HikvisionIsapiDevice` solo implementa la interfaz.
- No asumas recursos ni campos ISAPI: verifícalos en la guía del firmware. Lo no confirmado se marca `TODO(isapi)` y se cubre con prueba sobre `FakeDevice`.
- Toda credencial propia usa el prefijo de `employeeNo` del sistema. Nunca listes, edites ni borres usuarios sin ese prefijo.
- El código del QR es aleatorio criptográfico (`crypto.randomBytes`), sin datos personales, y único por tenant.
- Cada `GatewayCommand` lleva `idempotencyKey`; aplicar dos veces el mismo comando no cambia el resultado.
- El gateway nunca abre puertos de entrada; solo conexiones salientes.
- Hora: el gateway sincroniza NTP y alerta si un lector se desfasa más de 30 s.

## Flujo
1. `ReservationConfirmed` → `AccessService.issueCredentials()` crea una `Credential` por asistente con `syncStatus = PENDING` y un comando por lector (combos: un comando por cada lector de cada área).
2. El gateway recibe el comando, llama `upsertCredential`, responde `ack`.
3. Con todos los acks OK → `LOADED` → el pase queda disponible.
4. Cancelación u ocupación vencida → `REVOKE_CREDENTIAL`.
5. Purga diaria de credenciales vencidas.
6. Eventos de lectura → `AccessEvent` → asistencia y aforo estimado → WebSocket a la consola de garita.

## Sin internet
- Los lectores validan lo ya cargado.
- El gateway guarda eventos y acks en SQLite y los envía al reconectar, en orden.
- La nube marca alerta si una credencial sigue `PENDING` a menos de 30 minutos del inicio.

## Pase digital
- `GET /passes/:token`: token firmado (HMAC) con `credentialId` y vencimiento = `validTo`.
- Muestra QR, área, fecha, horario y normas básicas; sin login ni datos sensibles.

## Pruebas
- Gateway: comandos duplicados, desconexión a mitad de cola, lector que responde error, reconexión con eventos pendientes.
- Access: combos, cancelación, ocupación vencida, purga que ignora usuarios sin prefijo.
