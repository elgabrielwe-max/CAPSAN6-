# CAPSAN6 4.0.4 · Catálogo institucional de causas y subcausas RACS

## Cambios incluidos

- Se restauran los ocho tipos de causa institucionales I–VIII y todas sus subcausas previamente definidas.
- El formulario **Registrar nuevo RAC** vuelve a usar listas dependientes:
  - Tipo de reporte.
  - Tipo de causa.
  - Subcausa / causa normalizada.
- La IA clasifica únicamente contra el catálogo institucional y devuelve códigos y nombres canónicos.
- Máster y SSOMA pueden usar **Registrar nueva subcausa** dentro del formulario.
- Las subcausas nuevas quedan guardadas en la base central, disponibles para todos los registros posteriores y marcadas como personalizadas.
- Se crean las tablas relacionales `rac_cause_categories` y `rac_cause_subtypes`.
- Los RACS incorporan `cause_category_id` y `cause_subtype_id` sin eliminar las columnas de texto históricas.
- Los registros históricos que coinciden con el catálogo se enlazan automáticamente.
- El importador conserva los hotfixes de PostgreSQL y normaliza las causas contra el catálogo central.
- Se mantienen las correcciones de Incidentes y Accidentes, recuperación Máster, importación central y fechas.

## Permisos

- Máster: consulta y registra nuevas subcausas.
- SSOMA: consulta y registra nuevas subcausas.
- Supervisor: consulta y selecciona el catálogo, sin modificarlo.

## Despliegue

Subir el contenido extraído reemplazando archivos existentes. No eliminar PostgreSQL, el volumen, las variables ni las evidencias.
