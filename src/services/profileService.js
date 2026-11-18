
import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { httpError } from '../utils/http.js';
const PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'gender'];

export async function getProfile(uid) {
  requireFirebase();

  const [snap, avatarSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('avatars').doc(uid).get()
  ]);

  const data = snap.exists ? snap.data() : {};
  const avatar = avatarSnap.exists ? avatarSnap.data() : {};

  return {
    uid,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    birthDate: data.birthDate || '',
    gender: data.gender || '',
    email: data.email || '',
    emailVerified: Boolean(data.emailVerified),
    photoURL: avatar.data
      ? `data:${avatar.contentType || 'image/webp'};base64,${avatar.data}`
      : data.photoURL || ''
  };
}
export async function updateProfile(uid, patch) {
  requireFirebase();
  const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => PROFILE_FIELDS.includes(key)));
  if (!Object.keys(safe).length) throw httpError(400, 'Aucune information de profil modifiable fournie.', 'EMPTY_PROFILE_UPDATE');
  await db.collection('users').doc(uid).set({ ...safe, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getProfile(uid);
}
