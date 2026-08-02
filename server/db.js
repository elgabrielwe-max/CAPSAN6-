import pg from 'pg';
import { config } from './config.js';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 12,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function connectWithRetry(attempts = 12) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('PostgreSQL conectado');
      return;
    } catch (error) {
      last = error;
      console.error(`PostgreSQL no disponible (${i}/${attempts}): ${error.code || error.message}`);
      if (i < attempts) await sleep(Math.min(1500 * i, 8000));
    }
  }
  throw last;
}

export async function tx(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
