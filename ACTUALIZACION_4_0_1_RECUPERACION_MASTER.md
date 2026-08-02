# CAPSAN6 4.0.1 · Recuperación segura de cuenta Máster

Esta actualización no borra la base de datos ni modifica los módulos SSOMA.

## Recuperar acceso

En Railway, agrega temporalmente:

```env
MASTER_USERNAME=75863247
MASTER_RECOVERY_PASSWORD=RecuperarCAPSAN6#2026
```

La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.

Al iniciar, CAPSAN6:

- localiza la cuenta Máster existente;
- la reactiva si estaba desactivada o marcada como eliminada;
- restablece su usuario a `MASTER_USERNAME` cuando no existe conflicto;
- asigna la contraseña de recuperación;
- obliga a cambiarla después de ingresar;
- registra la recuperación para no repetirla en futuros reinicios.

Después de ingresar y cambiar la contraseña, elimina `MASTER_RECOVERY_PASSWORD` de Railway.

Para una recuperación futura, usa un valor distinto.
