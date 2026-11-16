
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { csrf, registerAccount, loginAccount, logoutAccount, currentAccount, verifyAccountEmail, forgotPassword, resetAccountPassword, updateAccountPassword, resendVerificationEmail } from '../controllers/authController.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, code: 'AUTH_RATE_LIMITED', message: 'Trop de tentatives. Réessayez dans quelques minutes.' } });
const email = z.string().trim().email().max(254);
const password = z.string().min(8).max(128);
const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: z.string().min(1).max(20),
  gender: z.enum(['female', 'male', 'other', 'prefer_not_say']),
  email, password
}).strict();
router.get('/csrf', csrf);
router.get('/me', currentAccount);
router.get('/verify-email', verifyAccountEmail);
router.post('/register', authLimiter, requireCsrf, validateBody(registerSchema), registerAccount);
router.post('/login', authLimiter, requireCsrf, validateBody(z.object({ email, password }).strict()), loginAccount);
router.post('/logout', requireCsrf, logoutAccount);
router.post('/resend-verification', authLimiter, requireCsrf, validateBody(z.object({ email }).strict()), resendVerificationEmail);
router.post('/forgot-password', authLimiter, requireCsrf, validateBody(z.object({ email }).strict()), forgotPassword);
router.post('/reset-password', authLimiter, requireCsrf, validateBody(z.object({ token: z.string().min(20), password }).strict()), resetAccountPassword);
router.post('/change-password', requireAuth, requireCsrf, validateBody(z.object({ currentPassword: password, newPassword: password }).strict()), updateAccountPassword);
export default router;
