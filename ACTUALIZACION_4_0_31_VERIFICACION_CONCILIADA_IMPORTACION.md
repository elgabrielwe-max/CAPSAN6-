# CAPSAN6 4.0.31 · Verificación conciliada de importación RACS

Corrige el error `La verificación central esperaba 52 RACS y encontró 50`.

La importación ahora diferencia entre:

- filas válidas procesadas;
- RACS únicos afectados;
- filas consolidadas porque corresponden al mismo RAC;
- números de reporte repetidos que deben conservarse como observaciones independientes.

La transacción solo se confirma cuando todos los RACS únicos afectados existen y pertenecen al lote actual.
