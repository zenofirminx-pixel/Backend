import { listPublishedContent } from '../services/contentService.js';
import { success, asyncHandler } from '../utils/http.js';
export const projects = asyncHandler(async (_req, res) => success(res, { projects: await listPublishedContent('projects') }));
export const news = asyncHandler(async (_req, res) => success(res, { news: await listPublishedContent('news') }));
export const services = asyncHandler(async (_req, res) => success(res, { services: await listPublishedContent('services') }));
