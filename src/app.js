import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { asyncHandler, success, httpError } from './utils/http.js';
import assistantRoutes from './routes/assistantRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import contentRoutes from './routes/contentRoutes.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(httpError(403, 'Cette origine n’est pas autorisée par CORS.', 'CORS_ORIGIN_DENIED'));
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  maxAge: 86400
}));
app.use(express.json({ limit: '32kb', strict: true }));
app.use(rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMaxRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Trop de requêtes. Réessayez plus tard.' }
}));

app.get('/api/health', (_req, res) => success(res, {
  service: 'OpenDC API',
  status: 'ok',
  timestamp: new Date().toISOString()
}));

const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.assistantRateLimitMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, code: 'ASSISTANT_RATE_LIMITED', message: 'Limite de messages atteinte. Réessayez dans une minute.' }
});

// Les contenus publiés sont lisibles par les visiteurs. Profil et assistant exigent un ID Token Firebase.
app.use('/api', contentRoutes);
app.use('/api/profile', requireAuth, profileRoutes);
app.use('/api/assistant', requireAuth, assistantLimiter, assistantRoutes);

app.use(notFound);
app.use(errorHandler);
export default app;
