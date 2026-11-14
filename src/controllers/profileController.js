import { getProfile, updateProfile } from '../services/profileService.js';
import { success, asyncHandler } from '../utils/http.js';
export const readProfile = asyncHandler(async (req, res) => success(res, { profile: await getProfile(req.user.uid, req.user.email || '') }));
export const patchProfile = asyncHandler(async (req, res) => success(res, { profile: await updateProfile(req.user.uid, req.body, req.user.email || '') }));
