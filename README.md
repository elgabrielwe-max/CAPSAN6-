# CAPSAN6 4.0.24 · Sistema Integral de Gestión SSOMA




## Mejora 4.0.24 · PPT Control RACS por unidad

- Nuevo botón **PPT Control RACS por unidad** en Descarga de recursos.
- Presentación dinámica con el modelo corporativo OPTIMUS / U.E.A. Candelaria Chanca.
- Incluye resumen general, análisis de cierre y sustento, riesgos y vencimientos, ficha por unidad y detalles de vencidos, altos abiertos, levantados sin sustento y pendientes de validación.
- Respeta los filtros de unidad y periodo usados en el control RACS.

## Mejora 4.0.23 · Falla en la programación de stock

- Se incorpora la categoría **IX. LOGÍSTICA, STOCK Y ABASTECIMIENTO** al catálogo central RACS.
- Se agrega la causa normalizada **FALLA EN LA PROGRAMACIÓN DE STOCK**.
- La opción queda disponible en registro manual, importación, clasificación asistida, filtros, Excel y PowerPoint.
- La clasificación local reconoce expresiones como falta de stock, sin stock, desabastecimiento y quiebre de stock.
- La migración se ejecuta automáticamente al iniciar el servidor y no modifica RACS históricos.

## Mejora 4.0.22 · Cierres RACS que no requieren evidencia

- Agrega a los perfiles SSOMA/Supervisor la opción **Todas las unidades actuales y futuras**.
- Las unidades nuevas se propagan automáticamente a los perfiles con ese alcance.
- Al guardar una unidad se renuevan los catálogos del navegador sin cerrar sesión.
- El Control SSOMA muestra todas las unidades accesibles, incluso si todavía tienen 0 RACS pendientes.
- Aplica los plazos RACS definidos por gerencia: ALTO hasta 48 horas, MEDIO hasta 3 días y BAJO hasta 4 días.
- Recalcula automáticamente los vencimientos históricos al desplegar la versión.
- Incorpora en Descarga de recursos el **Control RACS por unidad**, con vista en pantalla y Excel.
- El control incluye total, actos, condiciones, riesgo alto/medio/bajo, estados, pendientes de validación, levantados con/sin evidencia, vencidos y altos vencidos.

## Hotfix 4.0.19 · Depuración RACS y auditoría resistente

- Corrige el error PostgreSQL `value too long for type character varying(80)` al depurar numerosos RACS.
- La auditoría de la depuración usa una referencia corta y guarda la lista completa de IDs dentro de `details` JSONB.
- Migra `audit_log.entity_id` a `TEXT` en despliegues existentes.
- Una falla secundaria de auditoría ya no derriba el servidor ni oculta el resultado de una operación principal.



## Mejora 4.0.18 · Planes y evidencias SSOMA completos

- Agrega el botón **Ver plan completo** en Planes recientes.
- Muestra objetivo, actividades, estado, pendientes RACS y evidencias asociadas por unidad y fecha.
- Agrega el botón **Ver evidencia** con descripción completa, metadatos y archivo.
- Permite previsualizar imágenes, PDF, video y audio; otros formatos pueden descargarse.
- Mantiene el control de acceso por unidad y descarga autenticada desde Railway.

## Corrección 4.0.16 · Depuración de RACS

- Evita que el formulario recargue la página al confirmar la eliminación.
- Valida la frase exacta y la contraseña Máster antes de ejecutar.
- Evita dobles clics y muestra la cantidad realmente eliminada.


CAPSAN6 4.0.0 es una reconstrucción completa del sistema. La interfaz, la arquitectura del servidor y el modelo relacional fueron creados nuevamente para que todos los módulos trabajen sobre una sola fuente de datos.

## Módulos incluidos

### Capacitación
- Registro de temas, contenido, periodo y escala de evaluación.
- Asignación por unidad de negocio y área.
- Matriz de notas poblada desde la base maestra de trabajadores.
- Indicadores de ejecución, notas registradas, personal capacitado y aprobación.
- Dashboard y Excel Ejecutivo.

### RACS
- Dashboard compacto con filtros por unidad, fechas, estado, riesgo, tipo y Supervisor.
- Importador adaptativo de Excel: reconoce hojas, encabezados, fechas peruanas, periodos y números repetidos.
- Registro manual con IA para tipo de reporte, tipo de causa y subtipo normalizado, conservando el texto original.
- Asignación, seguimiento, evidencia final, validación SSOMA y levantamiento.
- Depuración segura exclusiva para Máster, con contraseña, frase exacta y respaldo.

### Gestión
- Unidades y áreas conectadas.
- Usuarios por una o varias unidades de negocio.
- Eliminación múltiple segura de usuarios.
- Ingreso del Máster al perfil SSOMA o Supervisor para asistencia.
- Base maestra e importación inteligente de trabajadores.
- Importación de Supervisores/SSOMA y temas de capacitación.

### Medio ambiente
- Identificación de RACS ambientales por reglas o IA.
- Clasificación por categoría ambiental.
- Registro de indicadores, incluyendo consumo de agua y meta.
- Diseño preparado para ampliar indicadores posteriormente.

### Control SSOMA
- Plan diario del día siguiente basado en pendientes por unidad.
- Evidencias SSOMA relacionadas o no con un RAC.
- Sincronización automática de archivos a Google Drive cuando está configurado.
- Descarga de recursos ejecutivos.

### Incidentes y accidentes
- Registro y seguimiento de eventos.
- Clasificación preventiva de severidad.
- Flash Report generado sobre el modelo oficial `OPT-SSO-FOR-010`.
- Evidencias gráficas, causa raíz, acciones y solución/cierre.
- Dashboard por fecha, unidad, tipo y estado.

## Reportes

Existe un solo **PPT Ejecutivo oficial de RACS**, estático y no interactivo. Analiza:
- total de RACS, actos, condiciones, alto potencial y porcentaje de levantamiento;
- personal y RACS por trabajador;
- unidades de negocio;
- supervisores que entregaron RACS;
- áreas reportantes;
- nivel de riesgo y causas normalizadas;
- tabla detallada de levantamiento.

También se incluyen:
- Excel Ejecutivo de RACS;
- Dashboard Ejecutivo público mediante enlace firmado y con vencimiento;
- Excel Ejecutivo de capacitación;
- Flash Report Excel conforme al modelo oficial.

## Base de datos única

Los módulos comparten los mismos catálogos y relaciones:

`Unidad → Áreas → Trabajadores → Capacitaciones/Notas`

`Unidad → Usuarios/Supervisores → RACS → Asignaciones/Evidencias`

`Unidad → SSOMA → Planes/Evidencias`

`Unidad → Incidentes → Flash Report/Evidencias`

La migración es idempotente: crea lo nuevo, agrega columnas faltantes y conserva la información histórica existente.

## Instalación

```bash
npm install
npm start
```

Comprobaciones:

```bash
npm run check
npm test
```

## Despliegue

Lee `CONFIGURACION_RAILWAY_Y_DRIVE.md` y `MIGRACION_DESDE_CAPSAN6_3.md` antes de reemplazar el repositorio.


## Paquete ligero para GitHub

La presentación empresarial usada como referencia visual no se incluye como archivo binario porque supera el límite de 25 MB de la carga web de GitHub. El generador del PPT Ejecutivo reproduce el modelo desde código y no necesita esa presentación en producción.


## Corrección 4.0.7

- El tipo de reporte (acto o condición) se conserva independiente de la causa y subcausa seleccionadas.
- El catálogo completo I–VIII está disponible para ambos tipos de reporte, sin bloquear registros históricos válidos.
- La importación conserva el tipo de reporte del Excel y normaliza la causa por catálogo.
- El PPT Ejecutivo acepta fechas PostgreSQL devueltas como objetos `Date` o texto ISO.
- Los errores al generar reportes son enviados al manejador HTTP y ya no reinician el servicio.


## Corrección 4.0.8
- PPT Ejecutivo para jefatura con los tres gráficos oficiales por unidad: Pareto de causas, Supervisores/áreas y levantamiento con barras y circular.
- Seguimiento RACS corregido con parámetros PostgreSQL tipados.
- Registro de notas conectado estrictamente a tema, unidad y áreas asignadas; buscador DNI y PDF de asistencia conservados.
- Importación multiperiodo con opción de importar todo, mes dominante o periodo específico.

## Corrección 4.0.9

- Nueva pestaña **Listado de cambios** dentro de Registro y levantamiento de RACS.
- Información completa del RAC junto con su historial auditado.
- Galería de evidencias con miniaturas de imágenes.
- Ampliación de imágenes y visor de PDF al hacer clic.
- Filtros por unidad, estado y búsqueda de RAC, reportante, lugar, causa o Supervisor.


## Corrección 4.0.11

- Los Supervisores ven automáticamente toda la información correspondiente a las unidades de negocio vinculadas a su perfil.
- La asignación individual de un RAC se conserva como identificación del responsable directo, pero ya no limita la visibilidad.
- Dashboard RACS, listado, cambios, evidencias, Excel, PPT e hipervínculo utilizan el mismo alcance por unidad.
- Un Supervisor con permiso de seguimiento puede registrar avance y evidencia en los RACS de sus unidades sin requerir una asignación previa.
- El Dashboard principal limita trabajadores, capacitaciones e incidentes a las unidades del perfil.


## Corrección 4.0.11 · Alcance real del Supervisor
- Las unidades explícitamente vinculadas al perfil se cargan incluso cuando contienen información histórica o están inactivas.
- Al ingresar como Supervisor o SSOMA, el sistema repara automáticamente vínculos históricos verificables desde RACS, asignaciones, notas, planes, evidencias e incidentes.
- El Dashboard muestra las unidades que forman el alcance efectivo del perfil.
- El Máster recibe el conteo de RACS disponibles al ingresar al perfil.


## Corrección 4.0.12 · Inicio de Railway reparado
- Se califican explícitamente `inferred.user_id` e `inferred.business_unit_id` en la migración de alcance histórico.
- Evita el error PostgreSQL `42702: column reference "business_unit_id" is ambiguous` durante `initSchema`.
- Conserva la reparación automática de unidades para Supervisores y SSOMA sin borrar información.

## Corrección 4.0.13 · Importación multiperiodo
- Se amplía `rac_import_batches.detected_period` de `VARCHAR(7)` a `VARCHAR(20)`.
- Se corrige el error PostgreSQL `22001: value too long for type character varying(7)` al importar archivos con varios meses.
- Se conserva el indicador `MULTIPERIODO` y el detalle de meses importados dentro del resumen JSON del lote.
- La migración es automática y no elimina RACS ni historiales anteriores.


## Corrección 4.0.15 · Registro RAC sin falso error visual

- El formulario conserva su referencia antes de esperar la respuesta de la API.
- Después de crear correctamente el RAC, el formulario se limpia sin intentar leer `event.currentTarget` cuando ya es `null`.
- Se mantiene la fecha actual y se reinicia la clasificación IA para el siguiente registro.
- No modifica el RAC creado ni genera duplicados.


## 4.0.15 · Supervisores automáticos por unidad
Al registrar un RAC, el sistema consulta la unidad seleccionada y asigna automáticamente a todos los usuarios activos con rol SUPERVISOR vinculados a esa unidad. La interfaz muestra previamente la lista de supervisores que recibirán el RAC.


## Cierre sin evidencia requerida · 4.0.22

SSOMA o Máster puede cerrar un RAC como **LEVANTADO** marcando **No requiere evidencia**, siempre con una justificación obligatoria. Estos cierres:

- cuentan dentro del total de levantados y del porcentaje de cierre;
- no se mezclan con “levantados con evidencia”;
- se muestran en el indicador independiente **No requiere evidencia**;
- quedan auditados con usuario, fecha y motivo;
- aparecen en una hoja específica del Excel de control RACS.

Los cierres antiguos sin archivo y sin excepción permanecen como **Sin sustento** para su regularización.

## RIT Diario e IDS · 4.0.22

- El antiguo DDS vuelve como **RIT Diario** (Reunión de Inicio de Turno).
- **IDS** se mantiene como módulo independiente de desempeño individual.
- RIT Diario registra fecha, unidad, área, guardia, tema, facilitador, personal programado, asistentes, cumplimiento, estado, observación y evidencia.
- IDS registra por trabajador y periodo: colaboradores a cargo, RAC programado/ejecutado, actos, condiciones, RIT-CAP, inspecciones, PARE, totales, cumplimiento y desempeño.
- Desempeño IDS: 90% o más = BUENO; 75% a 89.9% = REGULAR; menos de 75% = DEFICIENTE.
- Ambos módulos incluyen Excel descargable y filtros por unidad/periodo.

## Mejora 4.0.25 · Expediente documental de capacitación

- Planificación de capacitación permite adjuntar la lista de asistentes o documento rellenado por unidad y área.
- Admite PDF, imagen, Word y Excel de hasta 20 MB.
- PDF e imágenes tienen vista previa autenticada; todos los archivos pueden descargarse.
- Registro de notas conserva y muestra los mismos documentos en tarjetas compactas.
- Temas y asignaciones deja de mostrar listas verticales extensas y utiliza tarjetas resumidas con ventanas de detalle.
- Incluye buscador, filtro por estado, contador de documentos y acceso rápido a asignaciones.


## Mejora 4.0.26 · Listado direccionado y edición de RACS

- Nuevo apartado **Listado direccionado**, visible únicamente para Máster y SSOMA.
- Permite definir el área responsable y justificar por qué debe levantar la observación.
- Conserva por separado el área reportada original y el área direccionada.
- Permite corregir riesgo, tipo de reporte, tipo de causa, subcausa, descripción, lugar y acción propuesta.
- Máster y SSOMA pueden crear nuevos tipos de causa y nuevas subcausas desde el mismo flujo.
- Los supervisores no ven el apartado de administración; reciben el direccionamiento en su listado operativo y mediante notificación cuando están asignados.
- Todos los cambios quedan registrados en auditoría.


## Hotfix 4.0.28 · Migración segura de Listado direccionado

- Corrige el arranque sobre bases PostgreSQL existentes que todavía no tenían `racs.directed_area_id`.
- Primero crea las columnas de direccionamiento y recién después crea `idx_racs_direction`.
- Evita el ciclo de reinicios con error PostgreSQL `42703`.
- No elimina ni reinicia RACS, usuarios, archivos o configuraciones existentes.


## Hotfix 4.0.29 · Importación RACS

- Corrige la sentencia `INSERT INTO racs` usada por la importación conciliada.
- Alinea 33 columnas de destino con 33 expresiones SQL y 32 parámetros de entrada más el valor calculado de `lifted_at`.
- Evita el error PostgreSQL `42601: INSERT has more expressions than target columns`.
- La importación permanece transaccional: ante un error no se guardan filas parciales.


## Hotfix 4.0.30 · Conciliación de evidencias

- Corrige el conflicto de tipos PostgreSQL `42P08` durante la recuperación de evidencias después de reimportar RACS.
- Los 13 parámetros de la evidencia se convierten explícitamente a tipos compatibles dentro de un CTE.
- Conserva estado, evidencias, asignaciones, direccionamiento e historial recuperados desde la memoria de conciliación.
- La operación continúa siendo transaccional y no guarda importaciones parciales cuando ocurre un error.
