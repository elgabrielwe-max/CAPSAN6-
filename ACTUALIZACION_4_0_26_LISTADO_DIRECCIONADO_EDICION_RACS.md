# CAPSAN6 4.0.26 · Listado direccionado y edición de RACS

## Listado direccionado

Nuevo apartado exclusivo para perfiles **Máster** y **SSOMA** dentro de Registro y levantamiento de RACS.

Permite:

- Filtrar RACS sin direccionar, direccionados o todos.
- Seleccionar el área responsable del levantamiento.
- Registrar obligatoriamente el motivo del direccionamiento.
- Conservar el área reportante y el área reportada originales.
- Redireccionar un RAC cuando la responsabilidad cambia.
- Consultar quién realizó el direccionamiento y cuándo.

Los Supervisores no ven este apartado ni tienen permiso para modificar el direccionamiento.

## Edición y corrección

Desde la misma ventana, Máster y SSOMA pueden corregir:

- Área reportante.
- Área reportada.
- Área direccionada.
- Nivel de riesgo.
- Tipo de reporte.
- Tipo de causa.
- Subcausa.
- Descripción.
- Lugar o labor.
- Acción correctiva propuesta.

Cada modificación queda registrada en el historial del RAC.

## Catálogo ampliable

Se añadió la creación de **nuevos tipos de causa**, además de la creación de subcausas que ya existía. El código puede ingresarse manualmente o generarse automáticamente en secuencia romana.

## Base de datos

Se añaden sin eliminar información previa:

- `racs.directed_area_id`
- `racs.direction_reason`
- `racs.directed_by`
- `racs.directed_at`
- `rac_cause_categories.is_custom`
