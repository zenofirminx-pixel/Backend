
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import {
  csrf, registerAccount, loginAccount, logoutAccount,
  currentAccount, verifyAccountEmail, forgotPassword,
  resetAccountPassword, updateAccountPassword,
  resendVerificationEmail, setupTwoFactor, confirmTwoFactor,
  verifyLoginTwoFactorAccount, disableTwoFactorAccount,
  regenerateTwoFactorRecoveryCodesAccount
} from '../controllers/authController.js';
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
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    code: 'TWO_FACTOR_RATE_LIMITED',
    message: 'Trop de tentatives de vérification. Veuillez patienter 15 minutes avant de réessayer.'
  }
});

router.post('/2fa/login', authLimiter, requireCsrf,
  validateBody(z.object({
    code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9]{5}(?:-[A-Fa-f0-9]{5}){3})$/)
  }).strict()),
  verifyLoginTwoFactorAccount);


router.post('/2fa/disable', requireAuth, requireCsrf, twoFactorLimiter,
  validateBody(z.object({
    currentPassword: password,
    code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9]{5}(?:-[A-Fa-f0-9]{5}){3})$/)
  }).strict()),
  disableTwoFactorAccount);

router.post('/2fa/recovery-codes/regenerate', requireAuth, requireCsrf, twoFactorLimiter,
  validateBody(z.object({
    currentPassword: password,
    code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9]{5}(?:-[A-Fa-f0-9]{5}){3})$/)
  }).strict()),
  regenerateTwoFactorRecoveryCodesAccount);

router.post('/2fa/setup', requireAuth, requireCsrf, twoFactorLimiter,
  validateBody(z.object({ currentPassword: password }).strict()),
  setupTwoFactor);
router.post('/2fa/confirm', requireAuth, requireCsrf, twoFactorLimiter,
  validateBody(z.object({ code: z.string().regex(/^\d{6}$/) }).strict()),
  confirmTwoFactor);

router.post('/change-password', requireAuth, requireCsrf, validateBody(z.object({ currentPassword: password, newPassword: password }).strict()), updateAccountPassword);
export default router;
