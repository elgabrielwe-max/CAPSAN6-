# CAPSAN6 4.0.27 · Hotfix de migración de direccionamiento

## Problema corregido

En una base PostgreSQL ya existente, la tabla `racs` no tenía todavía la columna `directed_area_id`. La versión 4.0.26 intentaba crear el índice `idx_racs_direction` dentro del bloque inicial, antes de ejecutar las sentencias `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. PostgreSQL detenía el arranque con el código `42703`.

## Corrección

1. Se retiró la creación anticipada del índice.
2. Se ejecuta `ensureColumns()` para incorporar `directed_area_id`, `direction_reason`, `directed_by` y `directed_at`.
3. Después se crea `idx_racs_direction`.
4. Se registra la migración `4.0.27`.

La actualización es no destructiva y conserva todos los datos existentes.
