---
name: dashboard-ui
description: Cómo construir pantallas, formularios, tablas y componentes del dashboard Next.js y de la consola de garita siguiendo el sistema de diseño del proyecto. Úsalo siempre que se cree o modifique cualquier página, componente o flujo visual en apps/web o packages/ui, incluidos los CRUDs de configuración y catastro.
---

# UI del dashboard

## Antes de empezar
Lee `docs/design-system.md` (principios, tokens, componentes y patrones). No crees colores, tamaños ni componentes nuevos si ya existe uno en `packages/ui`.

## Estructura

```
apps/web/app/(dashboard)/<seccion>/page.tsx      # Server Component: layout y carga inicial
apps/web/app/(dashboard)/<seccion>/_components/  # Client Components de la sección
apps/web/app/(garita)/...                        # Consola de garita
apps/web/lib/api/                                # Cliente tipado generado desde OpenAPI
packages/ui/                                     # Componentes compartidos y tokens
```

## Reglas
- Datos con TanStack Query y el cliente tipado; nunca `fetch` suelto ni acceso a la base.
- Formularios: React Hook Form + zod; los esquemas reflejan los DTOs de la API.
- Cero lógica de negocio en el cliente. Totales, cupos y rechazos vienen de los endpoints (`/simulate`).
- Estados con `StatusBadge`; montos con `Money`; fechas con el helper `formatDateRange` en `America/Guayaquil`.
- Rechazos del motor: mostrar el mensaje del código de rechazo (`packages/domain/rejection-messages.es.ts`), no el código crudo.
- Acciones irreversibles con `ConfirmDialog`; apertura remota y descuento de garantía exigen motivo.
- Toda vista con estado de carga, vacío y error.
- Textos en español, cortos y sin jerga.

## Patrón de CRUD
1. Lista con `Table` (filtros en la URL, paginación del servidor).
2. Botón primario «Nuevo …» abre `Drawer` con el formulario.
3. Clic en una fila abre el detalle en `Drawer` con acciones.
4. Al guardar: toast de éxito e invalidación de la consulta.

## Consola de garita
- Objetivos táctiles ≥ 44 px, texto ≥ 16 px.
- WebSocket con reconexión e indicador «Sin conexión».
- Cronómetros de parqueadero calculados desde `checkInAt` del servidor, no desde el reloj del cliente al montar.

## Checklist
- [ ] Usa componentes y tokens de `packages/ui`
- [ ] Estados de carga, vacío y error
- [ ] Sin cálculos de negocio en el cliente
- [ ] Accesible por teclado y con etiquetas
