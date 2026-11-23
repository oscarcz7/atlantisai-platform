# ADR-0003: El LLM interpreta, el código decide

- Estado: Aceptada
- Fecha: 2026-11-18

## Contexto
El bot gestiona cobros, reservas y accesos físicos. Un modelo de lenguaje puede equivocarse o ser manipulado por el contenido que recibe.

## Decisión
Los agentes solo clasifican intención, extraen datos y redactan respuestas. Cualquier efecto (reservar, cobrar, cancelar, emitir QR, crear tickets) ocurre llamando a herramientas que invocan los mismos servicios del backend que usa el dashboard, con los permisos de la persona que escribe. Todo cobro o reserva requiere confirmación con botón del residente.

## Consecuencias
- Las reglas se prueban de forma determinística y no dependen del modelo.
- Cambiar de proveedor o modelo no altera reglas de negocio.
- Las herramientas deben devolver errores con códigos claros para que el agente los explique.
