import 'dotenv/config';
// Integra mejoras 4.0.27 y anteriores. Compatibilidad histórica: 4.0.26, 4.0.25 y 4.0.23.
// Referencia de despliegue anterior: CAPSAN6 4.0.24 ejecutándose.
import { app } from './app.js';
import { config } from './config.js';
import { connectWithRetry } from './db.js';
import { initSchema } from './schema.js';
import { ensureStorage } from './services/storage.js';
import { cleanupExpiredUploadCache } from './services/uploadCache.js';

async function start(){
  await connectWithRetry();
  await initSchema();
  await ensureStorage();
  await cleanupExpiredUploadCache().catch(error=>console.warn('No se pudo limpiar la caché temporal de importación:',error.message));
  const server=app.listen(config.port,()=>console.log(`CAPSAN6 4.0.41 ejecutándose en puerto ${config.port}`));
  // Evita que Node cierre cargas multipart lentas antes de que Railway termine de recibirlas.
  server.requestTimeout=15*60*1000;
  server.headersTimeout=16*60*1000;
  server.keepAliveTimeout=65*1000;
}
start().catch(error=>{console.error('No se pudo iniciar CAPSAN6:',error);process.exit(1);});
