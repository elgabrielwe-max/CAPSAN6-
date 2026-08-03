# CAPSAN6 4.0.8 · PPT para jefatura y estabilización integral

## PPT Ejecutivo oficial

Por cada unidad de negocio se generan sin omisiones:

1. Resumen mensual con personal, RACS a la fecha, RACS por trabajador y gráfico Pareto de causas con porcentaje acumulado.
2. Supervisores que entregaron RACS y áreas reportantes del último día filtrado, separados por actos y condiciones, más conclusión de alto potencial.
3. Tabla de levantamiento con los once campos oficiales, gráfico horizontal de pendientes por lugar y gráfico circular de causas pendientes.

Se conservan portada, charla de cinco minutos, evidencias y cierre institucional.

## Seguimiento RACS

El cambio de estado ahora usa un CTE con tipos explícitos (`varchar`, `int`, `text`) para evitar el error PostgreSQL 42P08 al reutilizar parámetros.

## Capacitación

Tema, unidad y área funcionan como filtros dependientes. La matriz solo muestra trabajadores pertenecientes a la asignación registrada. Se conserva el buscador por DNI/nombre y la carga de lista de asistentes en PDF. La nota aprobatoria predeterminada es 16.

## Importación

Cuando un Excel contiene varios periodos, se puede importar todo, solo el mes dominante o un periodo específico. La inserción continúa verificándose en la tabla central `racs`.
