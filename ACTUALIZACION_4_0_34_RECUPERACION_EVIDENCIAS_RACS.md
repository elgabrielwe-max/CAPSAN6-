# CAPSAN6 4.0.34 · Recuperación segura de evidencias RACS

## Listado direccionado

- Nueva columna **Descripción / evidencias**.
- Muestra el texto completo del hallazgo y el número de archivos asociados.
- El buscador también localiza palabras de la descripción.

## Recuperación histórica

Máster y SSOMA disponen del botón **Revisar evidencias pendientes**.

La coincidencia se realiza en este orden:

1. ID único de origen.
2. Huella estricta del registro.
3. Número de origen, fecha y texto.
4. Descripción, reportante y lugar.
5. Descripción exacta dentro de la misma unidad y fecha, solo cuando existe un único candidato.

Nunca se usa una descripción repetida para decidir automáticamente. Los casos ambiguos se informan y no se modifican.

La recuperación:

- Inserta evidencias faltantes.
- Reasigna evidencias que quedaron vinculadas a un RAC incorrecto cuando la coincidencia correcta es más fuerte.
- Evita duplicar el mismo archivo.
- Conserva el archivo físico y actualiza su relación con el RAC correcto.
- Registra la operación en auditoría.
- Se ejecuta automáticamente después de importar un periodo y también puede iniciarse manualmente desde el listado direccionado.
