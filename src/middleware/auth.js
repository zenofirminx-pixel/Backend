import { adminAuth, requireFirebase } from '../config/firebase.js';
import { httpError } from '../utils/http.js';
import { env } from '../config/env.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) throw httpError(401, 'Jeton Firebase manquant.', 'AUTH_TOKEN_MISSING');
    requireFirebase();
    req.user = await adminAuth.verifyIdToken(match[1], env.firebaseCheckRevoked);
    return next();
  } catch (error) {
    if (error.status) return next(error);
    return next(httpError(401, 'Jeton Firebase invalide ou expiré.', 'AUTH_TOKEN_INVALID'));
  }
}
