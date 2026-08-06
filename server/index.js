import 'dotenv/config';
// Integra mejoras 4.0.27 y anteriores. Compatibilidad histórica: 4.0.26, 4.0.25 y 4.0.23.
// Referencia de despliegue anterior: CAPSAN6 4.0.24 ejecutándose.
import { app } from './app.js';
import { config } from './config.js';
import { connectWithRetry } from './db.js';
import { initSchema } from './schema.js';
import { ensureStorage } from './services/storage.js';

async function start(){
  await connectWithRetry();
  await initSchema();
  await ensureStorage();
  app.listen(config.port,()=>console.log(`CAPSAN6 4.0.28 ejecutándose en puerto ${config.port}`));
}
start().catch(error=>{console.error('No se pudo iniciar CAPSAN6:',error);process.exit(1);});
