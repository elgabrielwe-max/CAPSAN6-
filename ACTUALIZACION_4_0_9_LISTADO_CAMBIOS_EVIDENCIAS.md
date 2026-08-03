# CAPSAN6 4.0.9 · Listado de cambios y evidencias RACS

## Nueva pestaña

En **RAC → Registro y levantamiento** se incorpora la pestaña **Listado de cambios**.

La vista permite filtrar por unidad, estado actual y búsqueda libre. Cada RAC muestra:

- código y número de origen;
- unidad, fecha, tipo, riesgo y estado;
- áreas reportante y reportada;
- lugar, Supervisor y porcentaje de avance;
- causa, subcausa, descripción y acción correctiva;
- historial auditado de creación, asignación y cambios de seguimiento;
- evidencias de seguimiento y finales.

## Evidencias

Las imágenes se presentan como miniaturas. Al hacer clic se abren ampliadas dentro del sistema. Los PDF se muestran en un visor y los formatos sin vista previa conservan la descarga. Los permisos por unidad y por perfil siguen aplicándose en el servidor.

## Compatibilidad

No se modifica ni elimina información histórica. La función utiliza las tablas existentes `racs`, `rac_evidence`, `file_assets` y `audit_log`.
