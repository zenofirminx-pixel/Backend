import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { success, asyncHandler, httpError } from '../utils/http.js';

const MAX_AVATAR_SIZE = 120 * 1024;

export const uploadAvatar = asyncHandler(async (req, res) => {
  requireFirebase();

  const encoded = req.body.imageBase64;

  if (typeof encoded !== 'string' || !encoded) {
    throw httpError(400, 'Choisissez une image.', 'INVALID_AVATAR');
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw httpError(400, 'Données Base64 invalides.', 'INVALID_AVATAR_FORMAT');
  }

  const buffer = Buffer.from(encoded, 'base64');

  if (
    buffer.length > MAX_AVATAR_SIZE ||
    buffer.toString('base64') !== encoded
  ) {
    throw httpError(413, 'La photo WebP ne doit pas dépasser 120 Ko.', 'AVATAR_TOO_LARGE');
  }

  const isWebP =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';

  if (!isWebP) {
    throw httpError(400, 'La photo doit être au format WebP.', 'INVALID_AVATAR_FORMAT');
  }

  await db.collection('avatars').doc(req.user.uid).set({
    data: encoded,
    contentType: 'image/webp',
    updatedAt: FieldValue.serverTimestamp()
  });

  await db.collection('userSearch').doc(req.user.uid).set({
    photoURL: `data:image/webp;base64,${encoded}`,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return success(res, {
    photoURL: `data:image/webp;base64,${encoded}`
  });
});
