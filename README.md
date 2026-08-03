# CAPSAN6 4.0.11 · Sistema Integral de Gestión SSOMA

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
