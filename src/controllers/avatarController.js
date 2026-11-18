import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { success, asyncHandler, httpError } from '../utils/http.js';

const MAX_AVATAR_SIZE = 120 * 1024;

export const uploadAvatar = asyncHandler(async (req, res) => {
  requireFirebase();

  if (!req.file) {
    throw httpError(400, 'Choisissez une image.', 'INVALID_AVATAR');
  }

  const buffer = req.file.buffer;

  if (buffer.length > MAX_AVATAR_SIZE) {
    throw httpError(413, 'La photo compressée ne doit pas dépasser 120 Ko.', 'AVATAR_TOO_LARGE');
  }

  const isWebP =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isWebP) {
    throw httpError(400, 'La photo doit être au format WebP.', 'INVALID_AVATAR_FORMAT');
  }

  const encoded = buffer.toString('base64');

  await db.collection('avatars').doc(req.user.uid).set({
    data: encoded,
    contentType: 'image/webp',
    updatedAt: FieldValue.serverTimestamp()
  });

  const photoURL = `data:image/webp;base64,${encoded}`;

  return success(res, { photoURL });
});
