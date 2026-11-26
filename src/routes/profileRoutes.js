import { Router } from 'express';
import { z } from 'zod';
import { readProfile, patchProfile } from '../controllers/profileController.js';
import { uploadAvatar } from '../controllers/avatarController.js';
import { validateBody } from '../middleware/validate.js';
import { requireCsrf } from '../middleware/csrf.js';

const router = Router();

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  username: z.string().trim().min(3).max(24)
    .regex(/^[a-zA-Z0-9_]+$/).optional(),
  birthDate: z.string().max(20).optional(),
  gender: z.enum(['', 'female', 'male', 'other', 'prefer_not_say']).optional()
}).strict();

const avatarSchema = z.object({
  imageBase64: z.string()
    .min(1)
    .max(163840)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
}).strict();

router.get('/', readProfile);
router.patch('/', requireCsrf, validateBody(profileSchema), patchProfile);
router.post('/avatar', requireCsrf, validateBody(avatarSchema), uploadAvatar);

export default router;
