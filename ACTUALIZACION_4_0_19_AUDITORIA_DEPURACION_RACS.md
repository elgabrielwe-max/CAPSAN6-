# CAPSAN6 4.0.19 · Hotfix auditoría de depuración RACS

## Problema corregido

Al eliminar una cantidad grande de RACS, la aplicación intentaba guardar todos los IDs separados por comas en `audit_log.entity_id`, columna limitada a 80 caracteres. PostgreSQL rechazaba el registro de auditoría con código `22001` y el proceso Node podía reiniciarse después de que la eliminación ya había sido ejecutada.

## Solución

1. `audit_log.entity_id` migra automáticamente de `VARCHAR(80)` a `TEXT`.
2. La depuración registra una referencia corta de respaldo como identificador de auditoría.
3. Los IDs eliminados se guardan completos en `details.ids`.
4. El servicio de auditoría captura sus propios errores y no derriba la operación principal.
5. La respuesta de la API devuelve `deleted`, `backupPath` y `purgeReference`.

## Verificación después del despliegue

Antes de repetir la eliminación, use **Vista previa**. Como la eliminación ocurre antes del registro de auditoría, es posible que los RACS ya se hayan eliminado aunque la pantalla mostrara error o Railway reiniciara el contenedor.
