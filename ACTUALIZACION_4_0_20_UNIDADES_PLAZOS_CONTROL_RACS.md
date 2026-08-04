# CAPSAN6 4.0.20 · Unidades, plazos y control ejecutivo RACS

## Alcance automático de unidades

Los perfiles SSOMA y Supervisor pueden marcarse como **Todas las unidades actuales y futuras**. El sistema vincula las unidades existentes y agrega automáticamente las que se creen después. La migración también detecta perfiles que ya cubrían todas las unidades operativas anteriores y repara su alcance.

## Plazos RACS

- ALTO: 0 a 48 horas (fecha de vencimiento = fecha del RAC + 2 días calendario).
- MEDIO: 1 a 3 días (fecha + 3 días calendario).
- BAJO: 1 a 4 días (fecha + 4 días calendario).

Los vencimientos existentes se recalculan durante el inicio de Railway.

## Descarga de recursos

Se incorpora una vista y un Excel **Control RACS por unidad** con:

- Total de RACS, actos y condiciones.
- Riesgo alto, medio y bajo.
- Pendientes, en proceso, pendientes de validación y devueltos.
- Levantados con evidencia y levantados sin evidencia final.
- Vencidos, vencen hoy y altos vencidos.
- Trabajadores y porcentaje de cierre.
- Hojas de detalle para vencidos, pendientes de validación, levantados sin evidencia y riesgo alto.
