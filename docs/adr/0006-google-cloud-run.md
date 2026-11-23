# ADR-0006: Google Cloud con Cloud Run

- Estado: Aceptada
- Fecha: 2026-11-21

## Contexto
Equipo pequeño, un edificio piloto y crecimiento esperado a varios edificios. Se necesita una nube con servicios administrados, costo bajo en el piloto, PostgreSQL con pgvector y soporte de WebSocket. El equipo trabaja con Antigravity.

## Decisión
- `api` y `web` como servicios de Cloud Run en `us-east1`.
- Cloud SQL para PostgreSQL 16 con la extensión `vector`, conectado por el conector de Cloud SQL.
- Cloud Storage para archivos, Secret Manager para secretos, Artifact Registry para imágenes.
- Despliegue desde GitHub Actions con Workload Identity Federation.
- Terraform para toda la infraestructura, con estado remoto en un bucket de Cloud Storage.

## Consecuencias
- Operación simple y costo proporcional al uso.
- Cloud Run limita la duración de las conexiones: la consola de garita y el túnel del gateway deben reconectarse automáticamente.
- `api` necesita una instancia mínima con CPU siempre asignada para procesar colas y tareas programadas.
- Todo es estándar (contenedores, PostgreSQL), por lo que una migración futura de nube es viable.
