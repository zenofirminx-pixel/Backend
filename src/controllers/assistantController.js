import { chatWithOpenDC } from '../services/assistantService.js';
import { success, asyncHandler } from '../utils/http.js';
export const chat = asyncHandler(async (req, res) => {
  const result = await chatWithOpenDC({ uid: req.user.uid, ...req.body });
  return success(res, result);
});
