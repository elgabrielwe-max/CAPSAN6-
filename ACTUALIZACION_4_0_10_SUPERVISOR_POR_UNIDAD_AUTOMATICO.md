# CAPSAN6 4.0.10 · Supervisor por unidad de negocio

## Alcance automático

Cuando un usuario con perfil **SUPERVISOR** está relacionado mediante `user_business_units` con una unidad de negocio, el sistema utiliza esa relación como alcance automático. No es necesario asignar cada RAC para que aparezca.

El alcance se aplica a:

- Dashboard principal y Dashboard RACS.
- Listado general, listado para levantamiento y listado de cambios.
- Evidencias y archivos asociados.
- Excel Ejecutivo, PPT Ejecutivo y Dashboard mediante hipervínculo.
- Capacitaciones, trabajadores, incidentes y datos SSOMA de las unidades vinculadas.

La asignación individual se mantiene para identificar al responsable directo y enviarle notificaciones específicas.

## Seguimiento

El Supervisor conserva la capacidad `rac:followup`; por ello puede actualizar avance y cargar evidencia de cualquier RAC perteneciente a sus unidades. La validación final y el estado `LEVANTADO` continúan reservados para SSOMA o Máster.

## Seguridad

Un Supervisor no puede consultar ni descargar información de unidades que no estén vinculadas a su perfil.
