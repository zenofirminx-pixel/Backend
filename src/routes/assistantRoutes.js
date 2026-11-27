import { Router } from 'express';
import { z } from 'zod';
import { chat, history } from '../controllers/assistantController.js';
import { validateBody } from '../middleware/validate.js';
import { requireCsrf } from '../middleware/csrf.js';
import { env } from '../config/env.js';

const router = Router();
const schema = z.object({
  message: z.string().trim().min(1).max(env.assistantMaxMessageChars),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(env.assistantMaxMessageChars) }).strict()).max(env.assistantMaxHistoryMessages).optional().default([]),
  language: z.string().trim().max(20).optional()
}).strict();
router.post('/chat', requireCsrf, validateBody(schema), chat);
router.get('/history', history);
export default router;
