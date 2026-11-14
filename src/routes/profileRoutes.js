import { Router } from 'express';
import { z } from 'zod';
import { readProfile, patchProfile } from '../controllers/profileController.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();
const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  birthDate: z.string().max(20).optional(),
  gender: z.enum(['', 'female', 'male', 'other', 'prefer_not_say']).optional(),
  photoURL: z.string().url().max(2048).or(z.literal('')).optional()
}).strict();
router.get('/', readProfile);
router.patch('/', validateBody(profileSchema), patchProfile);
export default router;
