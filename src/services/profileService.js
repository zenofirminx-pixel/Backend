
import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { httpError } from '../utils/http.js';
const PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'gender', 'photoURL'];
export async function getProfile(uid) {
  requireFirebase();
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() : {};
  return { uid, firstName: data.firstName || '', lastName: data.lastName || '',
    birthDate: data.birthDate || '', gender: data.gender || '',
    email: data.email || '', emailVerified: Boolean(data.emailVerified), photoURL: data.photoURL || '' };
}
export async function updateProfile(uid, patch) {
  requireFirebase();
  const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => PROFILE_FIELDS.includes(key)));
  if (!Object.keys(safe).length) throw httpError(400, 'Aucune information de profil modifiable fournie.', 'EMPTY_PROFILE_UPDATE');
  await db.collection('users').doc(uid).set({ ...safe, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return getProfile(uid);
}
