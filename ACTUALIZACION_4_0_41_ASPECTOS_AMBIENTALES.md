# CAPSAN6 4.0.41 — Aspectos ambientales

Se incorpora al catálogo institucional RACS el tipo de causa `X. ASPECTOS AMBIENTALES` con 49 subcausas, en el orden proporcionado para el Anexo IV.

## Alcance
- Registro manual de RACS.
- Edición y direccionamiento.
- Catálogo central de causas/subcausas.
- Importación: una subcausa ambiental escrita en el Excel puede resolverse contra el catálogo por coincidencia normalizada.
- La migración es idempotente: al desplegar, PostgreSQL inserta/activa la categoría X y sus subcausas sin duplicarlas.

No se modifica el flujo de evidencias ni su relación con los RACS.
