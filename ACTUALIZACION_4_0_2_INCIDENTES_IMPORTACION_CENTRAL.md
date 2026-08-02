# CAPSAN6 4.0.2 · Incidentes e importación central

## Incidentes y accidentes

- Corrige la consulta mensual que usaba `month` como alias SQL y provocaba `syntax error at or near "month"`.
- El dashboard ahora devuelve el periodo con el campo seguro `name`.
- Todas las rutas del módulo están protegidas con propagación de errores hacia el manejador HTTP; una consulta fallida ya no debe reiniciar el contenedor.
- Los filtros de unidad, fecha, tipo y estado se aplican tanto al listado como a los indicadores.
- La numeración anual del Flash Report usa un bloqueo transaccional para evitar códigos duplicados en registros simultáneos.

## Importador RACS

- Corrige el formulario web: el botón de confirmación conservaba una referencia inválida al evento del análisis y podía no ejecutar la importación.
- Corrige el INSERT de PostgreSQL que solicitaba el parámetro `$29` con solo 28 valores.
- La importación se realiza en una transacción y verifica inmediatamente cuántos RACS quedaron asociados al lote en la tabla central `racs`.
- La respuesta muestra nuevos, actualizados, verificados, total del periodo y total de la unidad.
- Las áreas detectadas se vinculan automáticamente con la unidad de negocio en `business_unit_areas`.
- Cuando el nombre del Supervisor coincide exactamente con un usuario Supervisor de la unidad, el RAC queda relacionado con su usuario y asignación activa.
- El botón no permite una doble importación mientras PostgreSQL procesa el archivo.

## Datos conservados

La actualización no elimina PostgreSQL, usuarios, RACS, capacitaciones, evidencias, incidentes, lotes ni archivos del volumen.
