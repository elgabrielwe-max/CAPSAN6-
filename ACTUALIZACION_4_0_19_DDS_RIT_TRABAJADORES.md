# CAPSAN6 4.0.19 · DDS y RIT conectados a trabajadores

## Alcance

Se incorpora un módulo operativo diario para registrar:

- **DDS — Diálogo Diario de Seguridad**.
- **RIT — Reunión de Inicio de Turno**.

El módulo no crea una lista paralela de personal. Utiliza directamente la tabla `workers` que ya alimenta capacitación y la base maestra de trabajadores.

## DDS

Registra fecha, unidad, área, turno, guardia, tema, objetivo, duración, expositor, observaciones y estado. La asistencia se vincula por `worker_id` y permite marcar: `ASISTIO`, `NO ASISTIO` o `JUSTIFICADO`.

## RIT

Registra fecha, unidad, área, turno, guardia, supervisor, resumen del turno anterior, actividades, riesgos críticos, controles, restricciones, compromisos y observaciones. Cada trabajador puede tener una actividad y responsabilidad asignada.

## Seguridad y alcance

Máster, SSOMA y Supervisor pueden utilizar el módulo. SSOMA y Supervisor solo ven y registran información en sus unidades vinculadas.

## Base de datos

Se agregan las tablas:

- `dds_sessions`
- `dds_attendance`
- `rit_sessions`
- `rit_participants`

Las tablas de detalle tienen llaves foráneas hacia `workers`; por lo tanto, el DNI, nombre, cargo, área y guardia siempre provienen de la base maestra existente.
