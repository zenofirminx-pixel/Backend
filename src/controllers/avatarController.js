
import crypto from 'node:crypto';
import { storage, requireFirebase } from '../config/firebase.js';
import { success, asyncHandler, httpError } from '../utils/http.js';
export const uploadAvatar = asyncHandler(async (req, res) => {
  requireFirebase();
  if (!req.file || !req.file.mimetype.startsWith('image/')) throw httpError(400, 'Choisissez un fichier image.', 'INVALID_AVATAR');
  if (req.file.size > 5 * 1024 * 1024) throw httpError(413, 'Image limitée à 5 Mo.', 'AVATAR_TOO_LARGE');
  if (!storage) throw httpError(503, 'Firebase Storage n’est pas configuré.', 'STORAGE_NOT_CONFIGURED');
  const bucket = storage.bucket();
  const id = crypto.randomUUID();
  const path = `avatars/${req.user.uid}/${id}`;
  const downloadToken = crypto.randomUUID();
  const file = bucket.file(path);
  await file.save(req.file.buffer, {
    resumable: false,
    metadata: { contentType: req.file.mimetype, metadata: { firebaseStorageDownloadTokens: downloadToken } }
  });
  const photoURL = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
  return success(res, { photoURL });
});
