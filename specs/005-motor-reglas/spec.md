# Spec 005 · Motor de reglas de reservas y cobros

- **Rama:** `feat/005-motor-reglas`
- **Fase:** 1 (Dashboard y motor de reglas)
- **Estado:** Aprobada para implementación
- **Origen:** [`specs-input/005-motor-reglas.md`](../../specs-input/005-motor-reglas.md)

## Objetivo

Implementar `packages/rules` como librería pura y determinística (sin I/O, sin `new Date()`, sin valores de NOAH hardcodeados) que evalúe `R01–R10` y calcule `C01–C04` de `docs/business-rules.md`, compartida por dashboard y bot.
