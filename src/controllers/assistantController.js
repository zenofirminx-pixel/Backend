import { chatWithPal, getConversationHistory } from '../services/assistantService.js';
import { success, asyncHandler } from '../utils/http.js';
export const chat = asyncHandler(async (req, res) => {
  const result = await chatWithPal({ uid: req.user.uid, ...req.body });
  return success(res, result);
});

export const history = asyncHandler(async (req, res) => {
  const result = await getConversationHistory(req.user.uid);
  return success(res, result);
});
