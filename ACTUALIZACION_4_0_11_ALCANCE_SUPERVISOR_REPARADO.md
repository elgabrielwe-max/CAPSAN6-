# CAPSAN6 4.0.11 · Alcance Supervisor reparado

## Problema
Al ingresar al perfil de un Supervisor, la aplicación podía mostrar cero datos aun cuando el usuario aparecía vinculado a una unidad. La consulta de sesión descartaba unidades marcadas como inactivas y los perfiles históricos podían no tener filas en `user_business_units`.

## Solución
- Las unidades explícitamente vinculadas se mantienen en el alcance, incluso para consultar información histórica.
- Se reparan automáticamente vínculos verificables usando RACS, asignaciones, registros creados, planes SSOMA, evidencias, incidentes y notas.
- La reparación se ejecuta al iniciar la aplicación, al iniciar sesión y al ingresar mediante modo asistencia.
- El Dashboard muestra el alcance efectivo del perfil.
- Se renovó la versión de caché del frontend.
