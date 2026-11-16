
import { register, login, logout, getSessionUser, verifyEmail, requestPasswordReset, resetPassword, changePassword, resendVerification } from '../services/authService.js';
import { success, asyncHandler, httpError } from '../utils/http.js';

const SESSION_COOKIE = 'opendc_session';
const COOKIE_OPTIONS = (maxAge) => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', path: '/', ...(maxAge ? { maxAge } : {})
});
export const csrf = asyncHandler(async (_req, res) => {
  const value = (await import('node:crypto')).randomBytes(32).toString('base64url');
  res.cookie('opendc_csrf', value, {
    httpOnly: false, secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', path: '/', maxAge: 2 * 60 * 60 * 1000
  });
  return success(res, { csrfToken: value });
});
export const registerAccount = asyncHandler(async (req, res) => {
  const result = await register(req.body);
  res.cookie(SESSION_COOKIE, result.sessionToken, COOKIE_OPTIONS(result.maxAge));
  return success(res, { message: result.message, user: result.user }, 201);
});
export const loginAccount = asyncHandler(async (req, res) => {
  const result = await login(req.body.email, req.body.password);
  res.cookie(SESSION_COOKIE, result.sessionToken, COOKIE_OPTIONS(result.maxAge));
  return success(res, { user: result.user });
});
export const logoutAccount = asyncHandler(async (req, res) => {
  await logout(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS());
  return success(res, { message: 'Déconnexion effectuée.' });
});
export const currentAccount = asyncHandler(async (req, res) => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) throw httpError(401, 'Session absente ou expirée.', 'SESSION_INVALID');
  return success(res, { user });
});
export const verifyAccountEmail = asyncHandler(async (req, res) => {
  const result = await verifyEmail(req.query.token);
  return res.status(200).type('html').send(`<main style="font:16px sans-serif;max-width:560px;margin:12vh auto;padding:24px"><h1>OpenDC</h1><p>${result.message}</p><a href="${process.env.FRONTEND_URL || '/'}">Retour à OpenDC</a></main>`);
});
export const resendVerificationEmail = asyncHandler(async (req, res) => success(res, await resendVerification(req.body.email)));
export const forgotPassword = asyncHandler(async (req, res) => success(res, await requestPasswordReset(req.body.email)));
export const resetAccountPassword = asyncHandler(async (req, res) => success(res, await resetPassword(req.body.token, req.body.password)));
export const updateAccountPassword = asyncHandler(async (req, res) => {
  await changePassword(req.user.uid, req.body.currentPassword, req.body.newPassword);
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS());
  return success(res, { message: 'Mot de passe modifié. Reconnectez-vous.' });
});
