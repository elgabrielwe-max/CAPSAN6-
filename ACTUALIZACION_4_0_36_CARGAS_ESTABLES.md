# CAPSAN6 4.0.36 · Cargas estables

## Diagnóstico

El log `Request aborted` proviene de Multer cuando el navegador, la red o el proxy cierran la conexión antes de terminar una carga multipart. CAPSAN6 y PostgreSQL sí habían iniciado correctamente.

## Corrección

- El importador de RACS conserva el Excel analizado en `/data/uploads/.import-cache` durante dos horas.
- La confirmación usa un token temporal ligado al usuario y a la unidad; no vuelve a transmitir el Excel.
- La copia se elimina únicamente después de una importación completada.
- Los tiempos de espera del servidor se ampliaron para cargas lentas.
- Los abortos se responden como carga interrumpida y no se registran como error interno del sistema.
- El cliente muestra mensajes diferenciados para pérdida de conexión y carga interrumpida.

## Seguridad

El token temporal es aleatorio, pertenece a un usuario y unidad específicos, vence en dos horas y no permite acceder a otro archivo o unidad.
