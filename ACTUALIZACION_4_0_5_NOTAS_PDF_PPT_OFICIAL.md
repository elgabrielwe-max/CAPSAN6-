# CAPSAN6 4.0.5 · Registro de notas, PDF de asistencia y PPT oficial

## Registro de notas

- Buscador instantáneo por DNI, nombres, cargo o área dentro del padrón cargado.
- Contador de trabajadores visibles al aplicar la búsqueda.
- Carga de la lista oficial de asistentes exclusivamente en PDF.
- Historial de listas PDF por tema, unidad y área.
- Los PDF se registran en `file_assets`, se relacionan con la capacitación y quedan preparados para sincronización con Drive.
- La carga de notas conserva la matriz masiva y la validación del rango permitido.

## Importación RACS

- Se corrigió la inserción de `rac_import_batches`, que reutilizaba el mismo parámetro PostgreSQL como texto y entero.
- Cada columna usa un parámetro independiente y un tipo explícito.
- Se conservan las correcciones transaccionales, de fechas y de verificación en la base central.

## PPT Ejecutivo oficial

- Se usa como referencia oficial `REPORTE_DIARIO_DE_SEGURIDAD 01.08.26 GN (2).pptx`.
- Formato 4:3, portada institucional y cierre corporativo.
- Calendario de charlas de cinco minutos del periodo.
- Por cada unidad: personal, total de RACS, reportes por trabajador, actos, condiciones y condiciones de alto potencial.
- Gráficos de supervisores que entregaron RACS y áreas reportantes, separados por actos y condiciones.
- Tabla de levantamiento con reportante, lugar, área, fecha, riesgo, tipo, desviación, descripción, responsable y estado.
- Gráficos de causas pendientes y diapositivas de evidencias con observación y medida correctiva.
- Se mantiene un único PPT Ejecutivo; no se restauran formatos interactivos o grupales.
