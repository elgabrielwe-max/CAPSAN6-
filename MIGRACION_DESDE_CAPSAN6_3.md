# Migración desde CAPSAN6 3.x

## Qué se reemplaza

Se reemplaza completamente el código del repositorio por CAPSAN6 4.0.0. La base PostgreSQL, el volumen, el dominio y las variables de Railway no deben eliminarse.

## Qué conserva la migración

- usuarios y credenciales existentes;
- unidades y áreas;
- trabajadores;
- temas y notas;
- RACS, estados, responsables y evidencias;
- lotes de importación;
- notificaciones y auditoría;
- Flash Reports históricos;
- archivos del volumen.

## Ajustes automáticos

- agrega códigos y relaciones faltantes;
- conecta trabajadores y áreas con unidades;
- transforma los estados históricos de RACS al flujo nuevo;
- corrige referencias huérfanas de lotes sin borrar RACS;
- crea una sola llave válida para lotes de importación;
- adapta tablas históricas de Flash Report y notificaciones;
- crea los catálogos del sistema nuevo.

## Orden recomendado

1. Genera o conserva un respaldo de PostgreSQL.
2. Conserva el volumen Railway.
3. Reemplaza todos los archivos del repositorio por el contenido del ZIP.
4. Confirma las variables de `CONFIGURACION_RAILWAY_Y_DRIVE.md`.
5. Espera el `Healthcheck succeeded`.
6. Prueba un usuario por perfil.
7. Prueba una importación pequeña de trabajadores y RACS.
8. Genera el PPT Ejecutivo, Excel Ejecutivo y un Flash Report.

No ejecutes borrados manuales de tablas durante la migración.
