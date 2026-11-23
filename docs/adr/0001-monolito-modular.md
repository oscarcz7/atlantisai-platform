# ADR-0001: Monolito modular en NestJS

- Estado: Aceptada
- Fecha: 2026-11-18

## Contexto
Equipo pequeño, un edificio piloto y escala esperada de decenas de edificios. Microservicios añadirían despliegues, redes y consistencia distribuida sin beneficio actual.

## Decisión
Un único backend NestJS (`apps/api`) con módulos de dominio aislados que se comunican por servicios públicos y eventos internos. El motor de reglas vive en `packages/rules`, sin dependencias de infraestructura.

## Consecuencias
- Un despliegue, transacciones locales simples, depuración sencilla.
- Exige disciplina en los límites entre módulos (no leer tablas ajenas).
- Si un módulo necesita escalar aparte (por ejemplo, `ai` o `messaging`), puede extraerse porque ya está aislado.
