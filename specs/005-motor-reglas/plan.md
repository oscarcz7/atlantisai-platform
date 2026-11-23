# Plan técnico · 005-motor-reglas

- `packages/rules/src/types.ts`: tipos puros de entrada/salida (`EvaluationInput`, `EvaluationResult`, `Charge`).
- `packages/rules/src/timezone.ts`: utilidades puras con `Intl.DateTimeFormat` para hora local, día de semana, semana lunes–domingo y mes calendario en `timezone` inyectado.
- `packages/rules/src/evaluate-reservation.ts`: evaluación estricta `R01 → R10` + cobros `C01` y `C03` + `initialStatus`.
- `packages/rules/src/evaluate-reservation.spec.ts`: pruebas de aceptación y rechazo para cada regla y tabla `describe.each` con todos los casos del Manual.
