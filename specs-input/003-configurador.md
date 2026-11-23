# 003 · Configurador del edificio

## Para /speckit.specify

Cada edificio tiene reglas distintas. Necesitamos que el SuperAdmin y el Administrador configuren todo lo que define cómo funciona un edificio, sin programar, y que se pueda clonar la configuración de un edificio a otro para dar de alta edificios nuevos en minutos.

Historias:
1. Como SuperAdmin, quiero crear un edificio con sus datos generales: nombre, RUC, logo, zona horaria, contactos de administración y guardianía, horarios de atención y cuentas bancarias.
2. Como Administrador, quiero definir los parámetros financieros: valor de la garantía, meses de mora tolerados, tarifas por invitado extra declarado y no declarado, y plazo para enviar comprobantes.
3. Como Administrador, quiero definir las tipologías de unidad y cuántos invitados incluye cada una por reserva.
4. Como Administrador, quiero registrar cada área comunal con su aforo, duración máxima, horario por día, frecuencia (por día, semana o mes), modo (compartida, exclusiva o de uso libre), anticipación permitida, si aplica cupos por tipología, si requiere garantía, costo de limpieza y si tiene lector.
5. Como Administrador, quiero indicar qué tipo de ocupante puede usar cada área (matriz de acceso).
6. Como Administrador, quiero definir combos de limpieza con su tarifa.
7. Como Administrador, quiero configurar los parqueaderos de visitas: cantidad, tiempo gratuito y tarifa por hora o fracción.
8. Como SuperAdmin, quiero clonar la configuración de un edificio a otro nuevo.
9. Como SuperAdmin, quiero cargar la configuración inicial de NOAH desde `seed/noah.config.json`.

Criterios de aceptación:
- Ningún valor de NOAH existe fuera de la configuración: con una configuración distinta, el sistema se comporta según ella.
- No se puede guardar un área con aforo ≤ 0, duración ≤ 0, horario con cierre antes de apertura o frecuencia con máximo ≤ 0.
- Un combo solo puede incluir áreas con costo de limpieza, y no puede repetirse el mismo conjunto de áreas.
- Cambiar un parámetro no altera reservas ya confirmadas; aplica a las nuevas.
- Cada cambio queda en auditoría con valor anterior y nuevo.
- Clonar un edificio copia parámetros, tipologías, áreas, matriz y combos, pero no unidades, personas, reservas ni datos financieros.
- La carga de `noah.config.json` es idempotente: ejecutarla dos veces no duplica nada.
- Un Contador o Guardia no puede modificar la configuración.

Fuera de alcance: lectores (se registran en Fase 2), documentos para el RAG (Fase 3).

## Para /speckit.plan

Respetar la constitución, `docs/domain-model.md` (Configuración), `docs/business-rules.md`, `seed/noah.config.json` y los skills `nestjs-module`, `prisma-multitenant` y `dashboard-ui`.

- Módulos `tenants` y `catalog`.
- `schedule` como JSON validado por día de semana; `frequency` como `{ period, max }` o nulo.
- Las cuentas bancarias son datos del edificio (titular, banco, tipo, número, propósito).
- Endpoint de importación de configuración (JSON) y comando `pnpm db:seed` que lo usa.
- Clonación en una transacción, con nuevo `tenant_id` para todo lo copiado.
- Pantallas: datos generales, parámetros, tipologías, áreas (tabla + panel lateral con formulario por secciones), matriz de acceso (tabla de áreas × roles con interruptores), combos, parqueaderos.
