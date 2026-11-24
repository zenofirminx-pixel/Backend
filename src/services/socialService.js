import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { httpError } from '../utils/http.js';

const idPair = (a, b) => [a, b].sort().join('__');
const cleanUser = (uid, data = {}) => ({
  uid, firstName: data.firstName || '', lastName: data.lastName || '',
  username: data.username || '', photoURL: data.photoURL || '',
  verified: Boolean(data.verified)
});
const dateValue = (value) => value?.toMillis?.() ?? (typeof value === 'number' ? value : Date.parse(value || '') || 0);
const notify = async (uid, notification) => db.collection('users').doc(uid).collection('notifications').add({
  ...notification, read: false, createdAt: FieldValue.serverTimestamp()
});
const requireUser = async (uid) => {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw httpError(404, 'Utilisateur introuvable.', 'USER_NOT_FOUND');
  return snap.data();
};

async function isBlockedEither(uid, otherUid) {
  const refs = [db.collection('userBlocks').doc(`${uid}__${otherUid}`), db.collection('userBlocks').doc(`${otherUid}__${uid}`)];
  const snaps = await Promise.all(refs.map(ref => ref.get()));
  return snaps.some(snap => snap.exists);
}
async function blockedIds(uid) {
  const [outgoing, incoming] = await Promise.all([
    db.collection('userBlocks').where('blockerUid', '==', uid).limit(500).get(),
    db.collection('userBlocks').where('blockedUid', '==', uid).limit(500).get()
  ]);
  return new Set([...outgoing.docs.map(doc => doc.data().blockedUid), ...incoming.docs.map(doc => doc.data().blockerUid)]);
}
export async function getFeed({ uid, limit = 20, before = null }) {
  requireFirebase();
  const n = Math.max(1, Math.min(Number(limit) || 20, 30));
  const blocked = await blockedIds(uid);
  let query = db.collection('posts').orderBy('createdAt', 'desc').limit(Math.min(n + blocked.size, 60));
  if (before) {
    const cursor = await db.collection('posts').doc(String(before)).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snap = await query.get();
  const visibleDocs = snap.docs.filter(doc => !blocked.has(doc.data().authorUid)).slice(0, n);
  const posts = await Promise.all(visibleDocs.map(async doc => {
    const data = doc.data();
    const [likeSnap, ownLike, commentSnap] = await Promise.all([
      doc.ref.collection('likes').count().get(),
      doc.ref.collection('likes').doc(uid).get(),
      doc.ref.collection('comments').count().get()
    ]);
    return {
      id: doc.id, author: cleanUser(data.authorUid, data.author || {}),
      text: data.text || '', photoData: data.photoData || null,
      photoMimeType: data.photoMimeType || null,
      createdAt: dateValue(data.createdAt), likesCount: likeSnap.data().count,
      commentsCount: commentSnap.data().count, likedByMe: ownLike.exists
    };
  }));
  return { posts, nextCursor: snap.docs.length >= n ? snap.docs.at(-1).id : null };
}

export async function createPost(uid, { text = '', photoData = null, photoMimeType = null }) {
  requireFirebase();
  const trimmed = String(text).trim();
  if (!trimmed && !photoData) throw httpError(400, 'Une publication doit contenir du texte ou une image.', 'EMPTY_POST');
  if (trimmed.length > 5000) throw httpError(400, 'Texte trop long (maximum 5000 caractères).', 'POST_TOO_LONG');
  let image = null;
  if (photoData) {
    const match = String(photoData).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || !['image/jpeg', 'image/png', 'image/webp'].includes(photoMimeType || match[1])) {
      throw httpError(400, 'Image invalide. Formats acceptés : JPEG, PNG, WebP.', 'INVALID_POST_IMAGE');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 450_000) throw httpError(413, 'Image trop volumineuse pour une publication.', 'POST_IMAGE_TOO_LARGE');
    image = { photoData: match[0], photoMimeType: match[1] };
  }
  const user = await requireUser(uid);
  const ref = await db.collection('posts').add({
    authorUid: uid, author: cleanUser(uid, user), text: trimmed,
    ...(image || {}), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    likesCount: 0, commentsCount: 0
  });
  return { id: ref.id, author: cleanUser(uid, user), text: trimmed, ...(image || {}), createdAt: Date.now(), likesCount: 0, commentsCount: 0, likedByMe: false };
}
export async function deletePost(uid, postId) {
  requireFirebase();
  const ref = db.collection('posts').doc(postId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, 'Publication introuvable.', 'POST_NOT_FOUND');
  if (snap.data().authorUid !== uid) throw httpError(403, 'Vous ne pouvez supprimer que vos publications.', 'POST_FORBIDDEN');
  // Remove nested data before deleting parent document.
  for (const sub of ['likes', 'comments']) {
    let children;
    do {
      children = await ref.collection(sub).limit(400).get();
      if (!children.empty) { const batch = db.batch(); children.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); }
    } while (!children.empty);
  }
  await ref.delete();
  return { deleted: true };
}
export async function toggleLike(uid, postId) {
  requireFirebase();
  const postRef = db.collection('posts').doc(postId);
  const likeRef = postRef.collection('likes').doc(uid);
  const initialPost = await postRef.get();
  if (!initialPost.exists) throw httpError(404, 'Publication introuvable.', 'POST_NOT_FOUND');
  if (await isBlockedEither(uid, initialPost.data().authorUid)) throw httpError(403, 'Cette action n’est pas autorisée.', 'USER_BLOCKED');
  let liked;
  await db.runTransaction(async tx => {
    const [post, like] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
    if (!post.exists) throw httpError(404, 'Publication introuvable.', 'POST_NOT_FOUND');
    liked = !like.exists;
    if (liked) tx.create(likeRef, { uid, createdAt: FieldValue.serverTimestamp() });
    else tx.delete(likeRef);
    tx.update(postRef, { likesCount: FieldValue.increment(liked ? 1 : -1), updatedAt: FieldValue.serverTimestamp() });
  });
  const post = await postRef.get();
  if (liked && post.data().authorUid !== uid) await notify(post.data().authorUid, { type: 'like', actorUid: uid, postId });
  return { liked, likesCount: Math.max(0, post.data().likesCount || 0) };
}
export async function listComments(postId, limit = 30) {
  requireFirebase();
  const post = await db.collection('posts').doc(postId).get();
  if (!post.exists) throw httpError(404, 'Publication introuvable.', 'POST_NOT_FOUND');
  const snap = await post.ref.collection('comments').orderBy('createdAt', 'asc').limit(Math.min(Math.max(Number(limit) || 30, 1), 50)).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: dateValue(doc.data().createdAt) }));
}
export async function addComment(uid, postId, text) {
  requireFirebase();
  const value = String(text || '').trim();
  if (!value || value.length > 2000) throw httpError(400, 'Commentaire vide ou trop long.', 'INVALID_COMMENT');
  const postRef = db.collection('posts').doc(postId);
  const post = await postRef.get();
  if (!post.exists) throw httpError(404, 'Publication introuvable.', 'POST_NOT_FOUND');
  if (await isBlockedEither(uid, post.data().authorUid)) throw httpError(403, 'Cette action n’est pas autorisée.', 'USER_BLOCKED');
  const user = await requireUser(uid);
  const ref = await postRef.collection('comments').add({ uid, author: cleanUser(uid, user), text: value, createdAt: FieldValue.serverTimestamp() });
  await postRef.update({ commentsCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  if (post.data().authorUid !== uid) await notify(post.data().authorUid, { type: 'comment', actorUid: uid, postId, commentId: ref.id });
  return { id: ref.id, uid, author: cleanUser(uid, user), text: value, createdAt: Date.now() };
}
export async function searchUsers(uid, query) {
  requireFirebase();
  const q = String(query || '').trim().toLowerCase().replace(/^@/, '');
  if (q.length < 2) return [];
  const end = q + '\uf8ff';
  const index = db.collection('userSearch');
  const queries = await Promise.all([
    index.orderBy('firstNameLower').startAt(q).endAt(end).limit(15).get(),
    index.orderBy('lastNameLower').startAt(q).endAt(end).limit(15).get(),
    index.orderBy('usernameLower').startAt(q).endAt(end).limit(15).get()
  ]);
  const blocked = await blockedIds(uid);
  const map = new Map();
  queries.forEach(snap => snap.docs.forEach(doc => {
    if (doc.id !== uid && !blocked.has(doc.id)) map.set(doc.id, cleanUser(doc.id, doc.data()));
  }));
  return [...map.values()].slice(0, 30);
}
export async function sendFriendRequest(uid, targetUid) {
  requireFirebase();
  if (!targetUid || uid === targetUid) throw httpError(400, 'Destinataire invalide.', 'INVALID_FRIEND_TARGET');
  const pair = idPair(uid, targetUid), requestRef = db.collection('friendRequests').doc(pair), friendshipRef = db.collection('friendships').doc(pair);
  if (await isBlockedEither(uid, targetUid)) throw httpError(403, 'Cette action n’est pas autorisée.', 'USER_BLOCKED');
  const target = await requireUser(targetUid);
  const sender = await requireUser(uid);
  let result;
  await db.runTransaction(async tx => {
    const [request, friendship] = await Promise.all([tx.get(requestRef), tx.get(friendshipRef)]);
    if (friendship.exists && friendship.data().status === 'accepted') throw httpError(409, 'Vous êtes déjà amis.', 'ALREADY_FRIENDS');
    if (request.exists && request.data().status === 'pending') {
      if (request.data().fromUid === targetUid) { result = 'incoming'; return; }
      throw httpError(409, 'Une demande est déjà en attente.', 'REQUEST_PENDING');
    }
    tx.set(requestRef, { fromUid: uid, toUid: targetUid, status: 'pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    result = 'sent';
  });
  if (result === 'sent') await notify(targetUid, { type: 'friend_request', actorUid: uid });
  return { status: result, recipient: cleanUser(targetUid, target), sender: cleanUser(uid, sender) };
}
export async function acceptFriendRequest(uid, otherUid) {
  requireFirebase();
  if (await isBlockedEither(uid, otherUid)) throw httpError(403, 'Cette action n’est pas autorisée.', 'USER_BLOCKED');
  const pair = idPair(uid, otherUid), reqRef = db.collection('friendRequests').doc(pair), friendshipRef = db.collection('friendships').doc(pair);
  await db.runTransaction(async tx => {
    const req = await tx.get(reqRef);
    if (!req.exists || req.data().status !== 'pending' || req.data().toUid !== uid) throw httpError(404, 'Demande entrante introuvable.', 'FRIEND_REQUEST_NOT_FOUND');
    tx.set(friendshipRef, { users: [uid, otherUid].sort(), status: 'accepted', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(reqRef, { status: 'accepted', acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await notify(otherUid, { type: 'friend_accepted', actorUid: uid });
  return { status: 'accepted' };
}
export async function listFriends(uid) {
  requireFirebase();
  const snap = await db.collection('friendships').where('users', 'array-contains', uid).where('status', '==', 'accepted').limit(200).get();
  const ids = snap.docs.map(doc => doc.data().users.find(id => id !== uid)).filter(Boolean);
  const profiles = await Promise.all(ids.map(requireUser));
  return ids.map((id, i) => cleanUser(id, profiles[i]));
}
export async function listFriendRequests(uid) {
  requireFirebase();
  const snap = await db.collection('friendRequests').where('toUid', '==', uid).where('status', '==', 'pending').limit(50).get();
  return Promise.all(snap.docs.map(async doc => ({ id: doc.id, ...doc.data(), sender: cleanUser(doc.data().fromUid, await requireUser(doc.data().fromUid)) })));
}
async function requireFriendship(uid, otherUid) {
  if (await isBlockedEither(uid, otherUid)) throw httpError(403, 'Cette action n’est pas autorisée.', 'USER_BLOCKED');
  const ref = db.collection('friendships').doc(idPair(uid, otherUid));
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'accepted') throw httpError(403, 'La messagerie est réservée aux amis.', 'FRIENDS_ONLY');
  return ref;
}
export async function listMessages(uid, otherUid, limit = 40) {
  requireFirebase();
  await requireFriendship(uid, otherUid);
  const convoRef = db.collection('conversations').doc(idPair(uid, otherUid));
  const snap = await convoRef.collection('messages').orderBy('createdAt', 'desc').limit(Math.min(Math.max(Number(limit) || 40, 1), 100)).get();
  return snap.docs.reverse().map(doc => ({ id: doc.id, ...doc.data(), createdAt: dateValue(doc.data().createdAt) }));
}
export async function sendMessage(uid, otherUid, text) {
  requireFirebase();
  const value = String(text || '').trim();
  if (!value || value.length > 4000) throw httpError(400, 'Message vide ou trop long.', 'INVALID_MESSAGE');
  await requireFriendship(uid, otherUid);
  const sender = await requireUser(uid);
  const convoRef = db.collection('conversations').doc(idPair(uid, otherUid));
  const messageRef = convoRef.collection('messages').doc();
  const friendshipRef = db.collection('friendships').doc(idPair(uid, otherUid));
  await db.runTransaction(async tx => {
    const friendship = await tx.get(friendshipRef);
    if (!friendship.exists || friendship.data().status !== 'accepted') throw httpError(403, 'La messagerie est réservée aux amis.', 'FRIENDS_ONLY');
    tx.set(convoRef, { members: [uid, otherUid].sort(), updatedAt: FieldValue.serverTimestamp(), lastMessage: value.slice(0, 140), lastSenderUid: uid }, { merge: true });
    tx.create(messageRef, { senderUid: uid, text: value, createdAt: FieldValue.serverTimestamp() });
  });
  await notify(otherUid, { type: 'message', actorUid: uid, conversationId: convoRef.id, messageId: messageRef.id });
  return { id: messageRef.id, senderUid: uid, text: value, createdAt: Date.now(), sender: cleanUser(uid, sender) };
}
export async function listNotifications(uid, limit = 50) {
  requireFirebase();
  const snap = await db.collection('users').doc(uid).collection('notifications').orderBy('createdAt', 'desc').limit(Math.min(Math.max(Number(limit) || 50, 1), 100)).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: dateValue(doc.data().createdAt) }));
}
export async function markNotificationRead(uid, notificationId) {
  requireFirebase();
  const ref = db.collection('users').doc(uid).collection('notifications').doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, 'Notification introuvable.', 'NOTIFICATION_NOT_FOUND');
  await ref.update({ read: true, readAt: FieldValue.serverTimestamp() });
  return { read: true };
}
export async function listConversations(uid) {
  requireFirebase();
  const snap = await db.collection('conversations').where('members', 'array-contains', uid).limit(100).get();
  const entries = await Promise.all(snap.docs.map(async doc => {
    const data = doc.data();
    const otherUid = (data.members || []).find(member => member !== uid);
    if (!otherUid) return null;
    let friendship;
    try { await requireFriendship(uid, otherUid); friendship = true; } catch { friendship = false; }
    if (!friendship) return null;
    const other = await requireUser(otherUid);
    return { id: doc.id, user: cleanUser(otherUid, other), lastMessage: data.lastMessage || '', lastSenderUid: data.lastSenderUid || '', updatedAt: dateValue(data.updatedAt) };
  }));
  return entries.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function getPublicProfile(viewerUid, uid) {
  requireFirebase();
  if (viewerUid !== uid && await isBlockedEither(viewerUid, uid)) throw httpError(403, 'Ce profil n’est pas accessible.', 'USER_BLOCKED');
  const user = await requireUser(uid);
  const avatar = await db.collection('avatars').doc(uid).get();
  const snap = await db.collection('posts').where('authorUid', '==', uid).orderBy('createdAt', 'desc').limit(20).get();
  const posts = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: dateValue(doc.data().createdAt) }));
  return { user: cleanUser(uid, { ...user, photoURL: avatar.exists && avatar.data().data ? `data:${avatar.data().contentType || 'image/webp'};base64,${avatar.data().data}` : user.photoURL }), posts };
}

export async function declineFriendRequest(uid, otherUid) {
  requireFirebase();
  const ref = db.collection('friendRequests').doc(idPair(uid, otherUid));
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== 'pending' || snap.data().toUid !== uid) throw httpError(404, 'Demande entrante introuvable.', 'FRIEND_REQUEST_NOT_FOUND');
  await ref.update({ status: 'declined', declinedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return { status: 'declined' };
}
export async function removeFriend(uid, otherUid) {
  requireFirebase();
  if (!otherUid || uid === otherUid) throw httpError(400, 'Utilisateur invalide.', 'INVALID_FRIEND_TARGET');
  const pair = idPair(uid, otherUid);
  const friendshipRef = db.collection('friendships').doc(pair);
  const requestRef = db.collection('friendRequests').doc(pair);
  const snap = await friendshipRef.get();
  if (!snap.exists || snap.data().status !== 'accepted') throw httpError(404, 'Relation d’amitié introuvable.', 'FRIENDSHIP_NOT_FOUND');
  await db.runTransaction(async tx => {
    const current = await tx.get(friendshipRef);
    if (current.exists && current.data().status === 'accepted') tx.delete(friendshipRef);
    tx.delete(requestRef);
  });
  return { removed: true };
}

export async function blockUser(uid, targetUid) {
  requireFirebase();
  if (!targetUid || uid === targetUid) throw httpError(400, 'Utilisateur invalide.', 'INVALID_BLOCK_TARGET');
  await requireUser(targetUid);
  const blockRef = db.collection('userBlocks').doc(`${uid}__${targetUid}`);
  const friendshipRef = db.collection('friendships').doc(idPair(uid, targetUid));
  const requestRef = db.collection('friendRequests').doc(idPair(uid, targetUid));
  await blockRef.set({ blockerUid: uid, blockedUid: targetUid, createdAt: FieldValue.serverTimestamp() });
  await db.runTransaction(async tx => {
    tx.delete(friendshipRef);
    tx.delete(requestRef);
  });
  return { blocked: true };
}
export async function unblockUser(uid, targetUid) {
  requireFirebase();
  const ref = db.collection('userBlocks').doc(`${uid}__${targetUid}`);
  await ref.delete();
  return { blocked: false };
}
export async function listBlockedUsers(uid) {
  requireFirebase();
  const snap = await db.collection('userBlocks').where('blockerUid', '==', uid).limit(500).get();
  return Promise.all(snap.docs.map(async doc => { const blockedUid = doc.data().blockedUid; return cleanUser(blockedUid, await requireUser(blockedUid)); }));
}
export async function reportContent(uid, { targetType, targetId, reason, details = '' }) {
  requireFirebase();
  const types = ['user', 'post', 'comment', 'message'];
  const reasons = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'];
  if (!types.includes(targetType) || !targetId || targetId.length > 160 || !reasons.includes(reason) || details.length > 1000) throw httpError(400, 'Signalement invalide.', 'INVALID_REPORT');
  const ref = await db.collection('moderationReports').add({ reporterUid: uid, targetType, targetId, reason, details: details.trim(), status: 'open', createdAt: FieldValue.serverTimestamp() });
  return { reportId: ref.id, submitted: true };
}
