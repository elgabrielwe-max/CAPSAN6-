import path from 'node:path';

const required = (name, fallback = '') => {
  const value = process.env[name] ?? fallback;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Falta variable obligatoria: ${name}`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT || 8080),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  publicUrl: process.env.PUBLIC_URL || '',
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'test' ? 'test-secret' : ''),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || '/data/uploads'),
  masterUsername: process.env.MASTER_USERNAME || '75863247',
  masterInitialPassword: process.env.MASTER_INITIAL_PASSWORD || '',
  masterName: process.env.MASTER_NAME || 'Administrador Máster',
  masterRecoveryPassword: process.env.MASTER_RECOVERY_PASSWORD || '',
  openAiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  drive: {
    enabled: process.env.GOOGLE_DRIVE_ENABLED === 'true',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '',
  },
};
