# CAPSAN6 4.0.6 · Paquete ligero para GitHub

Esta entrega elimina del repositorio la presentación de referencia de 26 MB que superaba el límite de carga web de GitHub.

El PPT Ejecutivo no depende de ese archivo: el diseño oficial 4:3, los indicadores, gráficos, tablas, portada y cierre están implementados directamente en `server/reports/racExecutive.js`, junto con los recursos gráficos compactos de `templates/assets`.

Se conservan las plantillas operativas del Flash Report y la base de ejemplo para trabajadores. No se modifica PostgreSQL, el volumen de Railway ni los datos existentes.
