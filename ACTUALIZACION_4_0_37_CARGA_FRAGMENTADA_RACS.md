# CAPSAN6 4.0.37 · Carga fragmentada de Excel RACS

La carga directa con Multer podía ser abortada por el navegador o el proxy de Railway aunque la conexión del usuario estuviera funcionando.

## Solución

1. El navegador inicia una sesión temporal de carga.
2. Divide el Excel en partes de 512 KB.
3. Envía cada parte por separado y la reintenta hasta cuatro veces.
4. Railway escribe cada parte directamente en el volumen `/data/uploads/.import-cache`.
5. Al completar todas las partes, CAPSAN6 reconstruye el Excel y lo analiza mediante el token temporal.
6. La confirmación de importación reutiliza el mismo archivo, sin volver a subirlo.

El sistema mantiene un máximo de 25 MB y elimina automáticamente las cargas temporales vencidas.
