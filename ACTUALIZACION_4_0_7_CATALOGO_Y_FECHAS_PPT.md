# CAPSAN6 4.0.7 · Catálogo RACS y fechas del PPT

## Correcciones

1. El tipo de reporte (`ACTO SUBESTANDAR` o `CONDICION SUBESTANDAR`) se conserva como dato independiente del catálogo de causas.
2. Las ocho categorías institucionales y todas sus subcausas pueden utilizarse sin que el sistema bloquee combinaciones históricas válidas.
3. La importación conserva el tipo del Excel y normaliza la causa/subcausa contra el catálogo central.
4. El PPT Ejecutivo normaliza fechas PostgreSQL tanto si llegan como texto ISO como si llegan como objetos `Date`.
5. Las rutas de reportes usan un envoltorio de errores asíncronos; una falla de generación devuelve una respuesta HTTP y no reinicia Railway.

## Conservado

- Nuevas subcausas personalizadas.
- Importación central de RACS.
- Incidentes y accidentes.
- Registro de notas y PDF de asistentes.
- PPT Ejecutivo oficial ligero para GitHub.
- Recuperación Máster, usuarios, evidencias y depuración de RACS.
