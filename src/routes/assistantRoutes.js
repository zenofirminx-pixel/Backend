import { Router } from 'express';
import { z } from 'zod';
import { chat } from '../controllers/assistantController.js';
import { validateBody } from '../middleware/validate.js';
import { env } from '../config/env.js';

const router = Router();
const schema = z.object({
  message: z.string().trim().min(1).max(env.assistantMaxMessageChars),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(env.assistantMaxMessageChars) }).strict()).max(env.assistantMaxHistoryMessages).optional().default([]),
  language: z.string().trim().max(20).optional()
}).strict();
router.post('/chat', validateBody(schema), chat);
export default router;
