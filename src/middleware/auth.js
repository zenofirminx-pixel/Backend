
import { getSessionUser } from '../services/authService.js';
import { httpError } from '../utils/http.js';
export async function requireAuth(req, _res, next) {
  try {
    const user = await getSessionUser(req.cookies?.opendc_session);
    if (!user) throw httpError(401, 'Session absente ou expirée.', 'SESSION_INVALID');
    req.user = user;
    next();
  } catch (error) { next(error.status ? error : httpError(401, 'Session invalide.', 'SESSION_INVALID')); }
}
