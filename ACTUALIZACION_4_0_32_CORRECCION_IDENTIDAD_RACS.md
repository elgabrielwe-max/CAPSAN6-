# CAPSAN6 4.0.32 · Corrección de identidad, origen y clasificación RACS

Esta versión corrige la conciliación usando los seis archivos reales entregados para Obra Civil Optimus, Diamantina, Planta Mahuara, Mina Candelaria, Desarrollos Mineros y Congemin.

## Regla segura contra duplicados

Un RAC ya no se considera duplicado solo por tener la misma descripción. La conciliación utiliza, en orden:

1. `ID ÚNICO ORIGEN`, cuando existe.
2. Número de origen + fecha dentro de la unidad, cuando el número es único.
3. Identidad estricta: unidad, fecha, reportante, área reportante, área reportada, lugar y descripción.

Cuando dos filas cambian únicamente el número, pero todos los demás datos anteriores son exactamente iguales, se consolidan como duplicado real. Si cambia el reportante, lugar o área, permanecen como RACS independientes.

## Resultado verificado con los archivos reales

- 326 filas válidas de origen.
- 11 copias verdaderas en Diamantina.
- 315 RACS únicos esperados.
- Los seis RACS válidos anteriormente fusionados quedan separados al reimportar.

## Correcciones adicionales

- Prioriza `N° origen`, `N° reporte` e `ITEM` sobre el código interno generado por CAPSAN6.
- Conserva la numeración 1–52 de Obra Civil y la secuencia histórica 166–174 de Desarrollos Mineros.
- Reconoce `SUPERVISOR ACARGO DE LA ENTREGA` y variantes, evitando responsables `SIN ASIGNAR` en Planta Mahuara.
- Conserva explícitamente `ACTO SUBESTÁNDAR` o `CONDICIÓN SUBESTÁNDAR` informado por el Excel.
- Conserva el texto de causa recibido y lo relaciona con el catálogo institucional sin reemplazarlo arbitrariamente por Orden y limpieza.
- Añade equivalencias para las causas reales encontradas en los seis archivos.

## Reimportación

No es necesario depurar nuevamente. Después de desplegar 4.0.32, se pueden reimportar los mismos archivos por su unidad correspondiente. CAPSAN6 actualizará los RACS coincidentes, incorporará los seis faltantes y conservará estados, evidencias, asignaciones, direccionamientos e historial operativo existentes.
