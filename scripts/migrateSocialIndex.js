import { db, requireFirebase, FieldValue } from '../src/config/firebase.js';

requireFirebase();
const users = await db.collection('users').get();
let indexed = 0;
let usernameConflicts = 0;
for (const userDoc of users.docs) {
  const uid = userDoc.id;
  const user = userDoc.data();
  const username = String(user.username || '').trim().toLowerCase();
  const searchRef = db.collection('userSearch').doc(uid);
  const usernameRef = username && /^[a-z0-9_]{3,24}$/.test(username)
    ? db.collection('authUsernameIndex').doc(username)
    : null;
  await db.runTransaction(async tx => {
    const searchSnap = await tx.get(searchRef);
    const usernameSnap = usernameRef ? await tx.get(usernameRef) : null;
    if (usernameRef && usernameSnap?.exists && usernameSnap.data().uid !== uid) {
      usernameConflicts++;
    } else if (usernameRef) {
      tx.set(usernameRef, { uid, username, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    tx.set(searchRef, {
      firstName: user.firstName || '', lastName: user.lastName || '',
      firstNameLower: String(user.firstName || '').toLowerCase(),
      lastNameLower: String(user.lastName || '').toLowerCase(),
      username: username, usernameLower: username,
      photoURL: user.photoURL || '', updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    if (!searchSnap.exists) indexed++;
  });
}
console.log(`Index Pal Social terminé. Comptes parcourus: ${users.size}. Index de recherche nouvellement créés: ${indexed}. Conflits username: ${usernameConflicts}.`);
process.exit(0);
