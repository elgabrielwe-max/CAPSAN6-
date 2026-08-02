# Verificación CAPSAN6 4.0.0

## Validación local realizada

- Sintaxis JavaScript: 43 archivos revisados.
- Pruebas automatizadas: 22 aprobadas, 0 fallidas.
- Arquitectura relacional y módulos requeridos comprobados.
- Matriz de permisos comprobada.
- Clasificación local de RACS ambientales, EPP y ventilación comprobada.
- Importadores revisados para encabezados variables, fechas peruanas y números repetidos.
- Eliminación múltiple de usuarios y depuración segura de RACS comprobadas por pruebas de código.
- Único PPT oficial de RACS comprobado; no existen rutas para PPT interactivo o grupal.
- Flash Report conectado a las celdas del modelo Excel oficial.

## Verificación necesaria en Railway

Este entorno no pudo instalar dependencias desde su repositorio interno, por lo que no se ejecutó una integración real contra PostgreSQL, Google Drive ni la generación binaria final de PPT/Excel. Después del despliegue valida:

- inicio y migración PostgreSQL;
- importación del Excel real de 244 trabajadores;
- importación de un archivo RACS de agosto;
- cambio de contraseña Supervisor;
- seguimiento con evidencia final y validación SSOMA;
- generación del PPT Ejecutivo oficial;
- generación del Flash Report oficial;
- sincronización de un archivo a Drive.
