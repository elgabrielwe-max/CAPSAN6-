# CAPSAN6 4.0.15 — Supervisores automáticos por unidad

## Cambio solicitado
Al registrar un RAC, todos los Supervisores activos vinculados a la unidad de negocio seleccionada quedan asignados automáticamente.

## Funcionamiento
- La interfaz filtra y muestra los Supervisores de la unidad.
- No es necesario elegirlos uno por uno.
- El servidor vuelve a consultar PostgreSQL y no depende de datos enviados por el navegador.
- Se crea una asignación activa para cada Supervisor.
- Todos reciben notificación, excepto quien esté registrando el RAC.
- Para compatibilidad, el primer Supervisor queda como responsable principal en `racs.supervisor_user_id`; el conjunto completo se conserva en `rac_assignments`.
- Los listados muestran los nombres de todos los Supervisores activos asignados.
