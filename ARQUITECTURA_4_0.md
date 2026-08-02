# Arquitectura CAPSAN6 4.0.0

## Principio central

Cada dato maestro se registra una sola vez y se reutiliza en todos los módulos. No se duplican trabajadores, unidades, áreas o perfiles en pantallas independientes.

## Relaciones principales

- `business_units`: catálogo principal de unidades de negocio.
- `areas` + `business_unit_areas`: áreas disponibles dentro de cada unidad.
- `users` + `user_business_units`: alcance de SSOMA y Supervisores por una o varias unidades.
- `workers`: personal con DNI, unidad, área, cargo, zona y guardia.
- `trainings` + `training_targets`: temas asignados a unidades y áreas.
- `grades`: nota única por trabajador y tema.
- `racs`: observaciones SSOMA relacionadas con unidad, áreas, responsable, causa, estado y plazo.
- `rac_assignments` y `rac_evidence`: carga del Supervisor y trazabilidad de levantamientos.
- `environmental_metrics`: agua y futuros indicadores ambientales.
- `ssoma_work_plans` y `ssoma_evidence`: planificación y evidencia del equipo SSOMA.
- `flash_reports` y `flash_report_images`: incidentes, accidentes y Flash Reports.
- `file_assets`: registro central de archivos locales y Google Drive.
- `public_share_links`: enlaces firmados con alcance, filtros y vencimiento.
- `audit_log`: trazabilidad de operaciones críticas.

## Perfiles

### Máster
Administración completa, datos maestros, usuarios, asistencia por suplantación controlada, depuración, reportes y sincronización Drive.

### SSOMA
Operación y validación en sus unidades: capacitación, RACS, ambiente, planes, evidencias, incidentes y recursos ejecutivos.

### Supervisor
Consulta y operación limitada a sus unidades y a los RACS creados o asignados a su perfil. Sus reportes ejecutivos respetan ese mismo alcance.

## Seguridad

- JWT con emisor y vencimiento.
- Contraseña obligatoria con política mínima.
- Permisos centralizados por capacidad.
- Alcance de unidad validado en servidor, no solo en la interfaz.
- Enlaces públicos con token aleatorio, hash SHA-256 y expiración.
- Eliminación lógica de usuarios, preservando RACS y auditoría.
- Depuración RACS con contraseña, frase exacta y respaldo previo.
