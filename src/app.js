
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { requireCsrf } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { asyncHandler, success, httpError } from './utils/http.js';
import authRoutes from './routes/authRoutes.js';
import assistantRoutes from './routes/assistantRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import contentRoutes from './routes/contentRoutes.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { 'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], 'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'], 'img-src': ["'self'", 'data:', 'blob:', 'https://firebasestorage.googleapis.com'] } } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(httpError(403, 'Cette origine n’est pas autorisée par CORS.', 'CORS_ORIGIN_DENIED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
  maxAge: 86400
}));
app.use(express.json({ limit: '32kb', strict: true }));
app.use(cookieParser());
app.use(rateLimit({
  windowMs: env.rateLimitWindowMs, limit: env.rateLimitMaxRequests,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Trop de requêtes. Réessayez plus tard.' }
}));
app.get('/api/health', (_req, res) => success(res, {
  service: 'OpenDC API', status: 'ok', timestamp: new Date().toISOString()
}));
app.use('/api/auth', authRoutes);
const assistantLimiter = rateLimit({
  windowMs: 60_000, limit: env.assistantRateLimitMax,
  standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'ASSISTANT_RATE_LIMITED', message: 'Limite de messages atteinte. Réessayez dans une minute.' }
});
app.use('/api', contentRoutes);
app.use('/api/profile', requireAuth, profileRoutes);
app.use('/api/assistant', requireAuth, requireCsrf, assistantLimiter, assistantRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
