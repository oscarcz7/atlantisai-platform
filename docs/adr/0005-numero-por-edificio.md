# ADR-0005: Un número de WhatsApp por edificio

- Estado: Aceptada
- Fecha: 2026-11-18

## Contexto
Cada edificio necesita identidad propia ante sus residentes y la gerencia prefiere separar canales.

## Decisión
Cada tenant tiene su propio número registrado en la Cloud API, bajo el mismo portafolio empresarial. El webhook resuelve el tenant por `phone_number_id`.

## Consecuencias
- Identidad y métricas separadas por edificio.
- Cada alta de edificio requiere una línea nueva y el registro del número.
- La lógica del bot es la misma para todos; solo cambia la configuración.
