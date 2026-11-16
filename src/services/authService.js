
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { env } from '../config/env.js';
import { httpError } from '../utils/http.js';

const SESSION_DAYS = 7;
const VERIFY_HOURS = 24;
const RESET_MINUTES = 30;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const emailKey = (email) => sha(email.trim().toLowerCase());
const safeUser = (uid, data) => ({
  uid, email: data.email, emailVerified: Boolean(data.emailVerified),
  firstName: data.firstName || '', lastName: data.lastName || '',
  birthDate: data.birthDate || '', gender: data.gender || '',
  photoURL: data.photoURL || ''
});
function mailer() {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPassword || !env.mailFrom) {
    throw httpError(503, 'Le service e-mail n’est pas configuré sur le serveur.', 'EMAIL_NOT_CONFIGURED');
  }
  return nodemailer.createTransport({
    host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPassword }
  });
}
async function sendActionEmail({ to, subject, text, html }) {
  await mailer().sendMail({ from: env.mailFrom, to, subject, text, html });
}
export async function register(input) {
  requireFirebase();
  const email = input.email.trim().toLowerCase();
  const key = emailKey(email);
  const uid = randomUUID();
  const verifyToken = token();
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const userRef = db.collection('users').doc(uid);
  const emailRef = db.collection('authEmailIndex').doc(key);
  await db.runTransaction(async tx => {
    const existing = await tx.get(emailRef);
    if (existing.exists) throw httpError(409, 'Cette adresse e-mail possède déjà un compte.', 'EMAIL_ALREADY_EXISTS');
    tx.create(emailRef, { uid, email, createdAt: FieldValue.serverTimestamp() });
    tx.create(userRef, {
      email, emailNormalized: email, passwordHash, emailVerified: false,
      firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      birthDate: input.birthDate, gender: input.gender,
      photoURL: '', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    tx.create(db.collection('authActionTokens').doc(sha(verifyToken)), {
      uid, purpose: 'verify-email', expiresAt: Date.now() + VERIFY_HOURS * 3600000,
      createdAt: FieldValue.serverTimestamp()
    });
  });
  const link = `${env.publicApiUrl}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
  await sendActionEmail({
    to: email, subject: 'Vérifiez votre adresse e-mail OpenDC',
    text: `Bonjour ${input.firstName},\n\nConfirmez votre adresse e-mail en ouvrant ce lien : ${link}\nCe lien expire dans 24 heures.`,
    html: `<p>Bonjour ${escapeHtml(input.firstName)},</p><p>Confirmez votre adresse e-mail OpenDC :</p><p><a href="${link}">Vérifier mon adresse e-mail</a></p><p>Ce lien expire dans 24 heures.</p>`
  });
  return { message: 'Compte créé. Consultez votre boîte e-mail pour vérifier votre adresse avant de vous connecter.' };
}
export async function verifyEmail(rawToken) {
  requireFirebase();
  if (!rawToken) throw httpError(400, 'Lien de vérification invalide.', 'INVALID_ACTION_TOKEN');
  const ref = db.collection('authActionTokens').doc(sha(rawToken));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().purpose !== 'verify-email' || snap.data().expiresAt < Date.now()) {
      throw httpError(400, 'Ce lien est invalide ou expiré.', 'INVALID_ACTION_TOKEN');
    }
    const userRef = db.collection('users').doc(snap.data().uid);
    tx.update(userRef, { emailVerified: true, emailVerifiedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.delete(ref);
  });
  return { message: 'Adresse e-mail vérifiée. Vous pouvez maintenant vous connecter.' };
}

export async function resendVerification(emailInput) {
  requireFirebase();
  const email = emailInput.trim().toLowerCase();
  const index = await db.collection('authEmailIndex').doc(emailKey(email)).get();
  if (index.exists) {
    const uid = index.data().uid;
    const user = await db.collection('users').doc(uid).get();
    if (user.exists && !user.data().emailVerified) {
      const verifyToken = token();
      await db.collection('authActionTokens').doc(sha(verifyToken)).set({
        uid, purpose: 'verify-email', expiresAt: Date.now() + VERIFY_HOURS * 3600000,
        createdAt: FieldValue.serverTimestamp()
      });
      const link = `${env.publicApiUrl}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
      await sendActionEmail({
        to: email, subject: 'Vérifiez votre adresse e-mail OpenDC',
        text: `Confirmez votre adresse e-mail avec ce lien : ${link}`,
        html: `<p>Confirmez votre adresse e-mail OpenDC :</p><p><a href="${link}">Vérifier mon adresse e-mail</a></p>`
      });
    }
  }
  return { message: 'Si ce compte existe et n’est pas encore vérifié, un nouveau lien vient d’être envoyé.' };
}

export async function login(emailInput, password) {
  requireFirebase();
  const email = emailInput.trim().toLowerCase();
  const index = await db.collection('authEmailIndex').doc(emailKey(email)).get();
  if (!index.exists) throw httpError(401, 'Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  const userRef = db.collection('users').doc(index.data().uid);
  const snap = await userRef.get();
  if (!snap.exists || !snap.data().passwordHash) throw httpError(401, 'Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  const user = snap.data();
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!ok) throw httpError(401, 'Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  if (!user.emailVerified) throw httpError(403, 'Vérifiez votre adresse e-mail avant de vous connecter.', 'EMAIL_NOT_VERIFIED');
  const sessionToken = token();
  const expiresAt = Date.now() + SESSION_DAYS * 86400000;
  await db.collection('authSessions').doc(sha(sessionToken)).set({
    uid: index.data().uid, expiresAt, createdAt: FieldValue.serverTimestamp()
  });
  return { sessionToken, maxAge: SESSION_DAYS * 86400000, user: safeUser(index.data().uid, user) };
}
export async function getSessionUser(sessionToken) {
  if (!sessionToken) return null;
  requireFirebase();
  const sessionRef = db.collection('authSessions').doc(sha(sessionToken));
  const session = await sessionRef.get();
  if (!session.exists) return null;
  const data = session.data();
  if (data.expiresAt <= Date.now()) { await sessionRef.delete(); return null; }
  const userSnap = await db.collection('users').doc(data.uid).get();
  if (!userSnap.exists || !userSnap.data().emailVerified) return null;
  return safeUser(data.uid, userSnap.data());
}
export async function logout(sessionToken) {
  requireFirebase();
  if (sessionToken) await db.collection('authSessions').doc(sha(sessionToken)).delete().catch(() => {});
}
export async function updateProfile(uid, patch) {
  requireFirebase();
  const allowed = ['firstName', 'lastName', 'birthDate', 'gender', 'photoURL'];
  const safe = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(safe).length) throw httpError(400, 'Aucune information modifiable fournie.', 'EMPTY_PROFILE_UPDATE');
  await db.collection('users').doc(uid).set({ ...safe, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const snap = await db.collection('users').doc(uid).get();
  return safeUser(uid, snap.data());
}
export async function changePassword(uid, currentPassword, newPassword) {
  requireFirebase();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !await argon2.verify(snap.data().passwordHash, currentPassword).catch(() => false)) {
    throw httpError(401, 'Mot de passe actuel incorrect.', 'INVALID_CREDENTIALS');
  }
  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await ref.update({ passwordHash, updatedAt: FieldValue.serverTimestamp() });
  const sessions = await db.collection('authSessions').where('uid', '==', uid).get();
  const batch = db.batch();
  sessions.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}
export async function requestPasswordReset(emailInput) {
  requireFirebase();
  const email = emailInput.trim().toLowerCase();
  const index = await db.collection('authEmailIndex').doc(emailKey(email)).get();
  // Même réponse pour une adresse connue ou inconnue afin de limiter l'énumération des comptes.
  if (index.exists) {
    const resetToken = token();
    const uid = index.data().uid;
    await db.collection('authActionTokens').doc(sha(resetToken)).set({
      uid, purpose: 'reset-password', expiresAt: Date.now() + RESET_MINUTES * 60000,
      createdAt: FieldValue.serverTimestamp()
    });
    const link = `${env.frontendUrl}/auth?mode=reset&token=${encodeURIComponent(resetToken)}`;
    await sendActionEmail({
      to: email, subject: 'Réinitialisation du mot de passe OpenDC',
      text: `Réinitialisez votre mot de passe avec ce lien : ${link}\nCe lien expire dans 30 minutes.`,
      html: `<p>Pour choisir un nouveau mot de passe, ouvrez ce lien :</p><p><a href="${link}">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans 30 minutes.</p>`
    });
  }
  return { message: 'Si cette adresse possède un compte, un e-mail de réinitialisation vient d’être envoyé.' };
}
export async function resetPassword(rawToken, password) {
  requireFirebase();
  const tokenRef = db.collection('authActionTokens').doc(sha(rawToken || ''));
  const snap = await tokenRef.get();
  if (!snap.exists || snap.data().purpose !== 'reset-password' || snap.data().expiresAt < Date.now()) {
    throw httpError(400, 'Ce lien est invalide ou expiré.', 'INVALID_ACTION_TOKEN');
  }
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const uid = snap.data().uid;
  await db.runTransaction(async tx => {
    const latest = await tx.get(tokenRef);
    if (!latest.exists || latest.data().expiresAt < Date.now()) throw httpError(400, 'Ce lien est invalide ou expiré.', 'INVALID_ACTION_TOKEN');
    const sessions = await tx.get(db.collection('authSessions').where('uid', '==', uid));
    tx.update(db.collection('users').doc(uid), { passwordHash, updatedAt: FieldValue.serverTimestamp() });
    tx.delete(tokenRef);
    sessions.docs.forEach(doc => tx.delete(doc.ref));
  });
  return { message: 'Mot de passe réinitialisé. Vous pouvez vous connecter.' };
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
