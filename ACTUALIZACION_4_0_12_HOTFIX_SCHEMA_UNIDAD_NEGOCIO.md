# CAPSAN6 4.0.12 · Hotfix de inicio Railway

## Error corregido
PostgreSQL detenía el arranque en `server/schema.js` porque la consulta de reparación histórica unía la subconsulta `inferred` con `users`, y ambas exponían una columna `business_unit_id`. La selección exterior no indicaba de qué origen tomarla.

## Solución
La consulta ahora selecciona explícitamente:

```sql
SELECT DISTINCT inferred.user_id, inferred.business_unit_id
```

Esto permite ejecutar la reparación automática del alcance de Supervisores y SSOMA y completar `initSchema`.

## Conservación de datos
No elimina ni modifica RACS, usuarios, unidades, evidencias, capacitaciones o incidentes.
