import { ZodError } from 'zod';
export function notFound(_req, res) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route introuvable.' });
}
export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) ? error.status : error instanceof ZodError ? 400 : 500;
  if (status >= 500) console.error('[OpenDC API]', error);
  res.status(status).json({
    success: false,
    code: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    message: status >= 500 && status !== 503 ? 'Une erreur interne est survenue.' : error.message || 'Requête impossible.'
  });
}
