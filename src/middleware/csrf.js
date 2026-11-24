
import { timingSafeEqual } from 'node:crypto';
import { httpError } from '../utils/http.js';
export function requireCsrf(req, _res, next) {
  const cookie = req.cookies?.pal_csrf || '';
  const header = req.get('X-CSRF-Token') || '';
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  if (!cookie || !header || a.length !== b.length || !timingSafeEqual(a, b)) {
    return next(httpError(403, 'Jeton CSRF absent ou invalide. Actualisez la page puis réessayez.', 'CSRF_INVALID'));
  }
  next();
}
