# CAPSAN6 4.0.17 · PPT Ejecutivo RACS exclusivo para gerencia

Esta actualización integra el formato ejecutivo solicitado para gerencia dentro del generador oficial:

`GET /api/reports/racs/executive.pptx`

## Cambios aplicados

- El PowerPoint ejecutivo ahora es exclusivo de RACS.
- Se eliminó la diapositiva de charla de 5 minutos del flujo del PPT RACS.
- Se agregó una portada específica: `REPORTE EJECUTIVO RACS`.
- Se agregó una diapositiva consolidada con KPIs de RACS:
  - Total RACS.
  - Actos.
  - Condiciones.
  - Alto potencial / riesgo alto.
  - Pendientes.
  - Porcentaje de levantamiento.
- Se mantiene la estructura gerencial por unidad:
  - Resumen por unidad.
  - Pareto de desviaciones.
  - Supervisores que entregaron RACS.
  - Áreas reportantes.
  - Tabla de levantamiento.
  - Evidencias fotográficas, si existen.
- Se corrigió el texto que confundía reporte diario con acumulado.
- Se corrigió el mensaje falso de `SIN RACS PENDIENTES DE LEVANTAMIENTO` cuando el detalle mostraba RACS pendientes.
- El archivo descargado ahora se llama:

`CAPSAN6_REPORTE_EJECUTIVO_RACS.pptx`

## Criterio de diseño

Se conserva la línea visual de gerencia y se centra únicamente en la gestión RACS. Las secciones de capacitación, charla diaria o temas mensuales no forman parte de este PPT.
