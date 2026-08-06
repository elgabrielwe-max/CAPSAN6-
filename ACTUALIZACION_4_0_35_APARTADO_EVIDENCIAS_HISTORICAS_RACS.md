# CAPSAN6 4.0.35 · Apartado de evidencias históricas RACS

Se añadió una pestaña independiente dentro de **Registro y levantamiento de RACS** para que Máster y SSOMA puedan revisar todas las evidencias guardadas durante la depuración y conciliación.

## Nueva pestaña

`Registro y levantamiento → Evidencias históricas`

La pestaña no se muestra a los Supervisores y su API exige la capacidad `rac:direct`.

## Información disponible

- RAC y número de origen anterior.
- Unidad, fecha, reportante, lugar y descripción original.
- Estado y avance antes de la depuración.
- Nombre, tipo, comentario y fecha de cada evidencia.
- RAC actual y RAC destino propuesto.
- Método utilizado para encontrar la coincidencia.
- Vista o descarga del archivo cuando continúa disponible.

## Clasificaciones

- **Ya presente:** está asociada al RAC correcto.
- **Por insertar:** tiene una coincidencia segura y todavía no está en `rac_evidence`.
- **Por reasignar:** está vinculada a otro código, pero el destino propuesto tiene una coincidencia superior.
- **Ambigua:** existen varios posibles destinos.
- **Sin coincidencia:** no existe un RAC actual suficientemente parecido.
- **Conflicto:** la relación existente tiene igual o mejor puntuación que el destino propuesto.

## Filtros

- Unidad.
- Desde y hasta.
- Situación de recuperación.
- Búsqueda por código, número de origen, descripción, reportante, lugar o nombre de archivo.

La recuperación automática continúa aplicándose únicamente a coincidencias seguras. Los casos ambiguos y sin coincidencia permanecen sin cambios para evitar colocar una evidencia en un RAC incorrecto.
