# CAPSAN6 4.0.14

Corrige el mensaje `Cannot read properties of null (reading 'reset')` que aparecía después de guardar exitosamente un RAC.

La causa era el uso de `event.currentTarget` después de una operación asíncrona. El formulario ahora se captura antes del `await` y se reinicia usando una referencia estable.
