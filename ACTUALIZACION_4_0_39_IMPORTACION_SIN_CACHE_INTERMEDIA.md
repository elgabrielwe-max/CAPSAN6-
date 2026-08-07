# CAPSAN6 4.0.39 — Importación RACS sin caché intermedia

- El análisis finaliza la carga fragmentada y lee el Excel dentro de la misma solicitud.
- La confirmación vuelve a enviar el archivo por partes y lo importa dentro de la misma operación.
- Ya no depende de que un token temporal sobreviva entre Analizar y Confirmar.
- Se conserva la transacción PostgreSQL y la conciliación de estados/evidencias.
