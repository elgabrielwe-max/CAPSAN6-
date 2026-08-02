# Configuración Railway y Google Drive

## Variables obligatorias en Railway

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=false
PUBLIC_URL=https://tu-servicio.up.railway.app
JWT_SECRET=una_clave_aleatoria_larga_y_privada
UPLOAD_DIR=/data/uploads
```

La variable `PORT` la entrega Railway automáticamente.

## Cuenta Máster

Solo cuando la base no tenga ningún Máster:

```env
MASTER_USERNAME=75863247
MASTER_INITIAL_PASSWORD=ContraseñaTemporalSegura1
MASTER_NAME=Administrador Máster
```

Después del primer inicio, deja `MASTER_INITIAL_PASSWORD` vacía.

## IA

La clasificación local funciona sin servicio externo. Para habilitar OpenAI:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
```

La IA de RACS clasifica el tipo de reporte, tipo de causa, subtipo normalizado y posible relación ambiental. No reemplaza ni reescribe el texto original del trabajador.

## Google Drive

1. Crea una cuenta de servicio en Google Cloud.
2. Activa Google Drive API.
3. Crea en Drive una carpeta raíz para CAPSAN6.
4. Comparte esa carpeta con el correo de la cuenta de servicio como editor.
5. Configura:

```env
GOOGLE_DRIVE_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_EMAIL=cuenta-servicio@proyecto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=ID_DE_LA_CARPETA_COMPARTIDA
```

Estructura automática:

```text
CAPSAN6/
  AÑO/
    MES/
      UNIDAD DE NEGOCIO/
        TIPO DE REGISTRO/
          CÓDIGO O ID/
            archivos
```

Cuando Drive no está habilitado o falla temporalmente, el archivo permanece en el volumen y queda marcado como `LOCAL` o `ERROR` para sincronización posterior.
