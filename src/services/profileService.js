import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { httpError } from '../utils/http.js';
const PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'gender', 'username'];
export async function getProfile(uid) {
  requireFirebase();
  const [snap, avatarSnap] = await Promise.all([db.collection('users').doc(uid).get(), db.collection('avatars').doc(uid).get()]);
  const data = snap.exists ? snap.data() : {};
  const avatar = avatarSnap.exists ? avatarSnap.data() : {};
  return { uid, firstName: data.firstName || '', lastName: data.lastName || '', username: data.username || '', birthDate: data.birthDate || '', gender: data.gender || '', email: data.email || '', emailVerified: Boolean(data.emailVerified), photoURL: avatar.data ? `data:${avatar.contentType || 'image/webp'};base64,${avatar.data}` : data.photoURL || '' };
}
export async function updateProfile(uid, patch) {
  requireFirebase();
  const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => PROFILE_FIELDS.includes(key)));
  if (!Object.keys(safe).length) throw httpError(400, 'Aucune information de profil modifiable fournie.', 'EMPTY_PROFILE_UPDATE');
  if (safe.username !== undefined) {
    safe.username = safe.username.trim().toLowerCase();
    if (safe.username && !/^[a-z0-9_]{3,24}$/.test(safe.username)) throw httpError(400, 'Le nom d’utilisateur doit contenir 3 à 24 caractères alphanumériques ou _.', 'INVALID_USERNAME');
  }
  const userRef = db.collection('users').doc(uid);
  const searchRef = db.collection('userSearch').doc(uid);
  await db.runTransaction(async tx => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw httpError(404, 'Compte introuvable.', 'USER_NOT_FOUND');
    const current = userSnap.data();
    const next = { ...current, ...safe };
    if (safe.username !== undefined && safe.username !== (current.username || '')) {
      const usernameRef = safe.username ? db.collection('authUsernameIndex').doc(safe.username) : null;
      const oldUsernameRef = current.username ? db.collection('authUsernameIndex').doc(current.username) : null;
      const [usernameSnap, oldUsernameSnap] = await Promise.all([
        usernameRef ? tx.get(usernameRef) : Promise.resolve(null),
        oldUsernameRef && oldUsernameRef.path !== usernameRef?.path ? tx.get(oldUsernameRef) : Promise.resolve(null)
      ]);
      if (usernameSnap?.exists && usernameSnap.data().uid !== uid) throw httpError(409, 'Ce nom d’utilisateur est déjà utilisé.', 'USERNAME_ALREADY_EXISTS');
      if (oldUsernameRef && oldUsernameSnap?.exists && oldUsernameSnap.data().uid === uid) tx.delete(oldUsernameRef);
      if (usernameRef) tx.set(usernameRef, { uid, username: safe.username, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.set(userRef, { ...safe, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(searchRef, {
      firstName: next.firstName || '', lastName: next.lastName || '',
      firstNameLower: (next.firstName || '').toLowerCase(), lastNameLower: (next.lastName || '').toLowerCase(),
      username: next.username || '', usernameLower: (next.username || '').toLowerCase(),
      photoURL: next.photoURL || '', updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
  return getProfile(uid);
}
