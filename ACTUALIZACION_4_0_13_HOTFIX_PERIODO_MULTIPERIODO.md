# CAPSAN6 4.0.13 · Hotfix de importación multiperiodo

## Problema corregido

Al importar un Excel que contenía RACS de más de un mes, el sistema registraba el valor `MULTIPERIODO` en `rac_import_batches.detected_period`. La base histórica conservaba esa columna como `VARCHAR(7)`, por lo que PostgreSQL devolvía el error `22001: value too long for type character varying(7)` y cancelaba la transacción.

## Solución

- `detected_period` se amplía a `VARCHAR(20)` en instalaciones nuevas.
- La migración cambia automáticamente la columna existente a `VARCHAR(20)` sin borrar lotes anteriores.
- El parámetro SQL se tipa explícitamente como `VARCHAR(20)`.
- Se conserva `MULTIPERIODO` para identificar cargas con varios meses.
- Los periodos exactos continúan almacenándose en `summary.importedPeriods`.
- La importación sigue siendo transaccional: si falla una fila, no deja un lote incompleto.
