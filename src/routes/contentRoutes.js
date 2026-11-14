import { Router } from 'express';
import { projects, news, services } from '../controllers/contentController.js';
const router = Router();
router.get('/projects', projects);
router.get('/news', news);
router.get('/services', services);
export default router;
