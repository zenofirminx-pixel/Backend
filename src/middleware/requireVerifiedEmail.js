import { httpError } from '../utils/http.js';
export function requireVerifiedEmail(req, _res, next) {
  if (!req.user?.emailVerified) return next(httpError(403, 'Vérifiez votre adresse e-mail avant d’utiliser les fonctions sociales.', 'EMAIL_NOT_VERIFIED'));
  next();
}
