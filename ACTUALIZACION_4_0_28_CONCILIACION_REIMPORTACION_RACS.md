# CAPSAN6 4.0.28 · Conciliación segura de RACS

## Objetivo

Evitar que un mismo RAC se duplique por tener códigos internos distintos y permitir una depuración seguida de reimportación sin perder:

- Estado actual y porcentaje de avance.
- Evidencias cargadas.
- Direccionamiento y motivo.
- Asignaciones a Supervisores.
- Comentarios, validación y excepción de evidencia.
- Historial de cambios.

## Regla de identificación

El modelo oficial incorpora `ID UNICO ORIGEN`. Ese valor debe ser único, permanente y no debe cambiar en futuras cargas.

Orden de conciliación:

1. ID ÚNICO ORIGEN.
2. N° de reporte + unidad + fecha, solo cuando la coincidencia es única.
3. Huella de unidad + fecha + reportante + descripción.
4. Huella de unidad + fecha + descripción, solo cuando la coincidencia es única.

El código interno generado por CAPSAN6 ya no es la única clave para decidir si se actualiza o inserta un registro.

## Depuración protegida

Antes de eliminar RACS, CAPSAN6 crea:

- Respaldo JSON en el volumen.
- Memoria de conciliación en PostgreSQL.

La memoria guarda el registro, evidencias y asignaciones. Al volver a importar, CAPSAN6 recupera el estado operativo más avanzado y fusiona duplicados históricos que correspondan a la misma observación.

## Reimportación

Cuando existe seguimiento operativo, la información del Excel actualiza los datos técnicos, pero no retrocede el estado del sistema. Por ejemplo, un RAC que ya está `LEVANTADO` no volverá a `PENDIENTE` porque el Excel todavía indique pendiente.

## Modelo oficial

Ruta dentro del sistema:

`Registro y levantamiento de RACS → Importar Excel → Descargar modelo oficial RACS`

Archivo incluido:

`public/templates/MODELO_OFICIAL_IMPORTACION_RACS_CAPSAN6.xlsx`

## Filtros nuevos

Se agregaron filtros `Desde` y `Hasta` en:

- Listado direccionado.
- Listado de cambios.

## Procedimiento recomendado

1. Desplegar CAPSAN6 4.0.28.
2. Confirmar en Railway: `CAPSAN6 4.0.28 ejecutándose en puerto 8080`.
3. Descargar y enviar el modelo oficial al equipo que prepara el Excel.
4. Recién después, usar Depuración segura de RACS.
5. Confirmar que el resultado indique registros guardados en memoria de conciliación.
6. Importar el Excel oficial seleccionando la unidad correcta.
7. Revisar el resumen: actualizados, recuperados, evidencias restauradas y duplicados fusionados.

## Importante

No depurar con una versión anterior a 4.0.28 si se necesita conservar evidencias e historial para la reimportación automática.
