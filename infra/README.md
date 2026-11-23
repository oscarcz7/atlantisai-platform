# Infraestructura

La infraestructura de Google Cloud se crea con Terraform en esta carpeta como parte de la spec `001-infra-base`. Estructura esperada y reglas: `docs/infrastructure.md` y skill `infra-gcp`.

- `local/`: inicialización de la base de datos para `docker compose`.
- `bootstrap/`: se ejecuta una sola vez (estado remoto, Workload Identity Federation, cuenta `deployer`).
- `modules/`, `envs/stg`, `envs/prd`: se generan en la spec 001.
