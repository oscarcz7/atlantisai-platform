# Sistema de diseño del dashboard

## Principios

1. **Operación antes que decoración.** Las pantallas son herramientas de trabajo diario: densidad media, datos legibles, acciones evidentes.
2. **El estado siempre visible.** Cada reserva, pago, credencial o lector muestra su estado con texto y color, nunca solo con color.
3. **Explicar los rechazos.** Cuando el motor rechaza algo, la interfaz muestra el motivo en lenguaje claro y, si aplica, cómo resolverlo.
4. **Nada irreversible sin confirmar.** Aprobar pagos, descontar garantías, cancelar reservas y abrir puertas de forma remota piden confirmación explícita y, cuando corresponde, un motivo.
5. **Español claro.** Textos cortos, sin jerga técnica; fechas como «sáb 23 nov, 13:00–19:00»; montos como «USD 50,00».

## Tokens

Definidos en `packages/ui/tokens.css` como variables CSS con modo claro y oscuro.

| Token | Uso |
| --- | --- |
| `--color-bg`, `--color-surface`, `--color-border` | Fondo, tarjetas, bordes |
| `--color-text`, `--color-text-muted` | Texto principal y secundario |
| `--color-primary` | Acción principal (un solo botón primario por vista) |
| `--color-success` | Confirmada, aprobada, conectado |
| `--color-warning` | Pendiente, por vencer, parqueadero cerca de 3 h |
| `--color-danger` | Rechazada, vencida, desconectado, exceso de tiempo |
| `--color-info` | En revisión, informativo |
| `--radius-sm` 6px · `--radius-md` 10px | Controles · tarjetas |
| Espaciado base 4px | Múltiplos de 4 |

Tipografía: Inter (fallback system-ui). Tamaños: 12 (metadatos), 14 (cuerpo), 16 (destacado), 20 y 24 (títulos). Números tabulares en tablas y montos.

## Componentes base (`packages/ui`)

`Button`, `IconButton`, `Input`, `Select`, `DateTimeRangePicker`, `Table` (orden, filtros, paginación del servidor), `StatusBadge`, `Money`, `EmptyState`, `ConfirmDialog` (con motivo opcional u obligatorio), `Drawer` (detalle sin salir de la lista), `Toast`, `Tabs`, `Calendar` (día/semana por área), `Timer` (cronómetro de parqueadero), `FileViewer` (imagen o PDF de comprobante).

`StatusBadge` mapea estados de dominio a texto y color en un solo lugar (`packages/ui/status.ts`); ninguna pantalla define colores de estado por su cuenta.

## Patrones de pantalla

- **Lista + detalle en panel lateral** para catastro, reservas, visitas e incidencias.
- **Vista dividida** en la bandeja contable: comprobante a la izquierda, estado de cuenta y datos leídos a la derecha, botones Aprobar / Rechazar fijos abajo.
- **Calendario** con bloques por área; color por estado; clic abre el detalle.
- **Formularios** con validación en línea y el resumen de cobros calculado por el backend antes de guardar (endpoint de simulación).
- **Estados vacíos** con la acción siguiente («Aún no hay unidades. Importar desde Excel»).

## Consola de garita

Pensada para tablet en horizontal y uso con una mano.

- Objetivos táctiles ≥ 44 px, texto ≥ 16 px, contraste alto.
- Tres zonas: visitas esperadas (búsqueda por nombre, cédula o placa), parqueaderos (4 tarjetas con cronómetro) y eventos de acceso en vivo (Fase 2).
- Cronómetro: normal hasta 2 h 45 min, `warning` hasta 3 h, `danger` después, con el cargo acumulado visible.
- Apertura remota: botón separado, confirmación con motivo obligatorio, registro en auditoría.
- Funciona con reconexión automática del WebSocket y muestra claramente «Sin conexión».

## Accesibilidad

WCAG 2.1 AA: contraste, foco visible, navegación por teclado en el dashboard, etiquetas en todos los controles, estados anunciados a lectores de pantalla.
