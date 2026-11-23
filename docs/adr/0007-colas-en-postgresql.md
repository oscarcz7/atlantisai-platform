# ADR-0007: Colas en PostgreSQL (pg-boss) para el piloto

- Estado: Aceptada
- Fecha: 2026-11-21

## Contexto
El sistema necesita trabajos asíncronos con reintentos (mensajes, órdenes al gateway, lectura de comprobantes) y tareas programadas (purga nocturna, alícuotas, vencimiento de reservas). Un Redis administrado tiene un costo mínimo alto para un solo edificio y añade una pieza más a operar.

## Decisión
Usar pg-boss sobre la misma base de datos Cloud SQL, en el esquema `pgboss`, detrás de una interfaz propia `JobQueue`. Las tareas programadas usan el scheduler de pg-boss.

## Consecuencias
- Una pieza menos de infraestructura y de costo en el piloto.
- Los trabajos pueden encolarse dentro de la misma transacción de negocio.
- Si el volumen lo exige, se implementa `JobQueue` con Redis + BullMQ sin cambiar los módulos.
