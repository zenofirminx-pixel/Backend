import 'dotenv/config';

const csv = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);
const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: positiveInt(process.env.PORT, 3000),
  corsOrigins: csv(process.env.CORS_ORIGINS || 'http://localhost:5173'),
  firebaseServiceAccountBase64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  firebaseCheckRevoked: process.env.FIREBASE_CHECK_REVOKED !== 'false',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiMaxOutputTokens: positiveInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 900),
  assistantMaxMessageChars: positiveInt(process.env.ASSISTANT_MAX_MESSAGE_CHARS, 2000),
  assistantMaxHistoryMessages: positiveInt(process.env.ASSISTANT_MAX_HISTORY_MESSAGES, 12),
  rateLimitWindowMs: positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMaxRequests: positiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
  assistantRateLimitMax: positiveInt(process.env.ASSISTANT_RATE_LIMIT_MAX, 12)
});
