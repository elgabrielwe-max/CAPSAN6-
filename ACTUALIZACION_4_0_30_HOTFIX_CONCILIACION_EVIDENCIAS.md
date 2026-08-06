# CAPSAN6 4.0.30 · Hotfix de conciliación de evidencias

- Corrige PostgreSQL `42P08: inconsistent types deduced for parameter $2`.
- La restauración de evidencias usa un CTE `incoming` y tipa una sola vez cada parámetro.
- Mantiene compatibilidad con instalaciones donde `evidence_type` fue creado como `TEXT` o `VARCHAR(30)`.
- Evita duplicar una evidencia por RAC, nombre almacenado y tipo de evidencia.
- La importación y conciliación siguen ejecutándose dentro de una transacción.
