# CAPSAN6 4.0.38 · Caché de importación persistente y autorrecuperable

## Problema corregido

Después de analizar un Excel, Railway podía rotar la réplica o perder la referencia temporal antes de confirmar, mostrando HTTP 410: “El archivo analizado ya no está disponible”.

## Solución

- El resultado del análisis se guarda con un token nuevo e independiente del token usado para ensamblar las partes.
- La copia se conserva en `/data/uploads/.import-cache` durante 6 horas.
- Cada lectura renueva el vencimiento.
- Se valida tamaño y SHA-256 para evitar usar archivos incompletos.
- Si Railway cambia de réplica y la copia no está disponible, el navegador vuelve a cargar, analizar e importar el mismo archivo automáticamente sin pedir que el usuario lo seleccione otra vez.
- El archivo temporal se elimina únicamente después de una importación exitosa.
