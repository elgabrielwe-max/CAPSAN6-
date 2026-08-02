# CAPSAN6 4.0.3 · Hotfix de tipos de fecha en importación RACS

## Error corregido

PostgreSQL rechazaba la importación con:

```text
inconsistent types deduced for parameter $9
text versus date
```

El mismo parámetro se utilizaba para `report_date` y para calcular `lifted_at`. PostgreSQL podía deducirlo como texto en un contexto y como fecha en otro.

## Corrección

- `report_date` se convierte explícitamente a `date`.
- `lifted_at` usa `date` de forma explícita.
- `due_date` se convierte explícitamente a `date`.
- `progress_percent` se convierte explícitamente a `int` en la condición.
- La misma protección se aplica tanto a RACS nuevos como a actualizaciones de RACS existentes.
- La importación sigue siendo transaccional y conserva la verificación contra la tabla central `racs`.

No elimina ni modifica RACS históricos fuera del lote que se está importando.
