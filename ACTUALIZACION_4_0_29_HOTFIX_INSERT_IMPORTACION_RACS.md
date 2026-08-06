# CAPSAN6 4.0.29 · Hotfix de importación RACS

## Problema corregido

Durante la importación conciliada, PostgreSQL devolvía:

`INSERT has more expressions than target columns` (`42601`).

La consulta declaraba 33 columnas, pero la cláusula `VALUES` contenía 34 expresiones. El último parámetro `$33` no correspondía a ninguna columna.

## Corrección

La cláusula `VALUES` ahora contiene exactamente 33 expresiones:

- 32 parámetros enviados desde Node.js.
- 1 expresión calculada para `lifted_at`.

## Seguridad de datos

La importación se ejecuta dentro de una transacción. Si ocurrió el error anterior, PostgreSQL realizó `ROLLBACK`, por lo que no quedaron RACS parcialmente importados por ese intento.
