# CAPSAN6 4.0.18 · Planes y evidencias SSOMA completos

## Cambio solicitado

En la pantalla **Plan diario y evidencias**, las tablas recientes ya no muestran solamente textos resumidos. Cada registro incluye una acción para consultar su contenido completo.

## Planes recientes

El botón **Ver plan completo** muestra:

- Fecha, unidad, responsable SSOMA y estado.
- Objetivo completo sin recortes.
- Todas las actividades programadas.
- Resumen de RACS pendientes registrado al crear el plan.
- Evidencias de cumplimiento de la misma unidad y fecha.

## Evidencias recientes

El botón **Ver evidencia** muestra:

- Título y descripción completa del cumplimiento.
- Fecha, unidad, responsable y RAC relacionado.
- Nombre y tamaño del archivo.
- Previsualización de imágenes, PDF, video y audio.
- Descarga autenticada para cualquier formato.
- Enlace de Drive cuando se encuentre disponible.

## Seguridad

La API devuelve el identificador del archivo asociado sin exponer la ruta física del volumen. La apertura y descarga continúan pasando por `/api/files/:id`, que valida la sesión y el acceso del usuario a la unidad de negocio.
