
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { readProfile, patchProfile } from '../controllers/profileController.js';
import { uploadAvatar } from '../controllers/avatarController.js';
import { validateBody } from '../middleware/validate.js';
import { requireCsrf } from '../middleware/csrf.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 120 * 1024, files: 1 } });
const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  birthDate: z.string().max(20).optional(),
  gender: z.enum(['', 'female', 'male', 'other', 'prefer_not_say']).optional()
}).strict();
router.get('/', readProfile);
router.patch('/', requireCsrf, validateBody(profileSchema), patchProfile);
router.post('/avatar', requireCsrf, upload.single('avatar'), uploadAvatar);
export default router;
