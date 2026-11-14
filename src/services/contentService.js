import { db, requireFirebase } from '../config/firebase.js';

const COLLECTIONS = Object.freeze({ projects: 'projects', news: 'news', services: 'services' });
export async function listPublishedContent(type) {
  requireFirebase();
  const collectionName = COLLECTIONS[type];
  if (!collectionName) throw new Error('Collection de contenu inconnue.');
  const snap = await db.collection(collectionName).where('status', '==', 'published').limit(50).get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  docs.sort((a, b) => dateValue(b.publishedAt || b.updatedAt) - dateValue(a.publishedAt || a.updatedAt));
  return docs;
}
function dateValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
