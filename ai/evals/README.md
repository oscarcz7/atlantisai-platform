# Evals de los agentes

Cada línea de `casos.jsonl` es un caso: agente, contexto inyectado, mensaje del usuario y expectativas.

Campos de `expect`:
- `tool` / `tool_any`: herramienta que debe llamarse (null = ninguna).
- `tool_not`: herramienta que no debe llamarse.
- `args`: argumentos que deben coincidir (subconjunto).
- `tool_result_code`: código que devuelve la herramienta simulada en ese caso.
- `response_includes` / `response_includes_any` / `response_must_not`: aserciones sobre el texto.
- `asks_for`: datos que el agente debe pedir.
- `buttons`: botones esperados.

Ejecución: `pnpm ai:eval` corre cada caso con herramientas simuladas y reporta aciertos por agente. Agrega un caso por cada error real detectado; no borres casos que alguna vez fallaron.
