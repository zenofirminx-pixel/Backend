import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { env } from './env.js';

function serviceAccountFromEnv() {
  if (env.firebaseServiceAccountBase64) {
    try {
      return JSON.parse(Buffer.from(env.firebaseServiceAccountBase64, 'base64').toString('utf8'));
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 ne contient pas un JSON de compte de service valide.');
    }
  }
  if (env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey) {
    return {
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey
    };
  }
  return null;
}

const existing = getApps();
const account = serviceAccountFromEnv();
let app = existing[0] || null;
if (!app && account) {
  app = initializeApp({
    credential: cert(account),
    ...(env.firebaseStorageBucket ? { storageBucket: env.firebaseStorageBucket } : {})
  });
}

export const firebaseConfigured = Boolean(app);
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
export { FieldValue };

export function requireFirebase() {
  if (!firebaseConfigured) {
    const error = new Error('Firebase Admin n’est pas configuré sur le serveur.');
    error.status = 503;
    error.code = 'FIREBASE_NOT_CONFIGURED';
    throw error;
  }
  return { db, storage };
}
