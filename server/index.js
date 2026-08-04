import 'dotenv/config';
import { app } from './app.js';
import { config } from './config.js';
import { connectWithRetry } from './db.js';
import { initSchema } from './schema.js';
import { ensureStorage } from './services/storage.js';

async function start(){
  await connectWithRetry();
  await initSchema();
  await ensureStorage();
  app.listen(config.port,()=>console.log(`CAPSAN6 4.0.18 ejecutándose en puerto ${config.port}`));
}
start().catch(error=>{console.error('No se pudo iniciar CAPSAN6:',error);process.exit(1);});
