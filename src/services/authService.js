
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import { db, FieldValue, requireFirebase } from '../config/firebase.js';
import { env } from '../config/env.js';
import { httpError } from '../utils/http.js';
import {
  createTotpEnrollment,
  encryptTotpSecret,
  decryptTotpSecret,
  verifyTotpCode,
  createRecoveryCodes,
  verifyRecoveryCode
} from './totpService.js';

const SESSION_DAYS = 7;
const VERIFY_HOURS = 24;
const RESET_MINUTES = 30;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const emailKey = (email) => sha(email.trim().toLowerCase());
const safeUser = (uid, data) => ({
  uid, email: data.email, emailVerified: Boolean(data.emailVerified),
  firstName: data.firstName || '', lastName: data.lastName || '', username: data.username || '',
  birthDate: data.birthDate || '', gender: data.gender || '',
  photoURL: data.photoURL || '',
  twoFactorEnabled: Boolean(data.twoFactorEnabled)
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

  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

  const userRef = db.collection('users').doc(uid);
  const emailRef = db.collection('authEmailIndex').doc(key);
  const username = (input.username || '').trim().toLowerCase();
  const usernameRef = username
    ? db.collection('authUsernameIndex').doc(username)
    : null;

  await db.runTransaction(async tx => {
    const existing = await tx.get(emailRef);
    const existingUsername = usernameRef ? await tx.get(usernameRef) : null;

    if (existing.exists) {
      throw httpError(409, 'Cette adresse e-mail possède déjà un compte.', 'EMAIL_ALREADY_EXISTS');
    }

    if (existingUsername?.exists) {
      throw httpError(409, 'Ce nom d’utilisateur est déjà utilisé.', 'USERNAME_ALREADY_EXISTS');
    }

    tx.create(emailRef, { uid, email, createdAt: FieldValue.serverTimestamp() });

    if (usernameRef) {
      tx.create(usernameRef, { uid, username, createdAt: FieldValue.serverTimestamp() });
    }

    tx.create(userRef, {
      email,
      emailNormalized: email,
      passwordHash,
      emailVerified: false,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username,
      birthDate: input.birthDate,
      gender: input.gender,
      photoURL: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    tx.set(db.collection('userSearch').doc(uid), {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      firstNameLower: input.firstName.trim().toLowerCase(),
      lastNameLower: input.lastName.trim().toLowerCase(),
      username,
      usernameLower: username,
      photoURL: '',
      createdAt: FieldValue.serverTimestamp()
    });
  });

  const sessionToken = token();
  const maxAge = SESSION_DAYS * 86400000;

  await db.collection('authSessions').doc(sha(sessionToken)).set({
    uid,
    expiresAt: Date.now() + maxAge,
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    sessionToken,
    maxAge,
    user: safeUser(uid, {
      email,
      emailVerified: false,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username,
      birthDate: input.birthDate,
      gender: input.gender,
      photoURL: ''
    }),
    message: 'Compte créé. Vérification du compte requise.'
  };
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
        to: email, subject: 'Vérifiez votre adresse e-mail Pal',
        text: `Confirmez votre adresse e-mail avec ce lien : ${link}`,
        html: `<p>Confirmez votre adresse e-mail Pal :</p><p><a href="${link}">Vérifier mon adresse e-mail</a></p>`
      });
    }
  }
  return { message: 'Si ce compte existe et n’est pas encore vérifié, un nouveau lien vient d’être envoyé.' };
}

export async function login(emailInput, password) {
  requireFirebase();

  const email = emailInput.trim().toLowerCase();
  const index = await db.collection('authEmailIndex').doc(emailKey(email)).get();

  if (!index.exists) {
    throw httpError(401, 'Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  const uid = index.data().uid;
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  if (!snap.exists || !snap.data().passwordHash) {
    throw httpError(401, 'Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  const user = snap.data();
  const ok = await argon2.verify(user.passwordHash, password).catch(() => false);

  if (!ok) {
    throw httpError(401, 'Adresse e-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  if (user.twoFactorEnabled) {
    const challengeToken = token();

    await db.collection('authTwoFactorChallenges').doc(sha(challengeToken)).set({
      uid,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp()
    });

    return {
      twoFactorRequired: true,
      challengeToken,
      challengeExpiresIn: 300
    };
  }

  const sessionToken = token();

  await db.collection('authSessions').doc(sha(sessionToken)).set({
    uid,
    expiresAt: Date.now() + SESSION_DAYS * 86400000,
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    sessionToken,
    maxAge: SESSION_DAYS * 86400000,
    user: safeUser(uid, user)
  };
}
export async function confirmAccountPassword(uid, password) {
  requireFirebase();

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  if (!snap.exists || !snap.data().passwordHash) {
    throw httpError(404, 'Compte introuvable.', 'USER_NOT_FOUND');
  }

  const user = snap.data();
  const valid = await argon2.verify(user.passwordHash, password).catch(() => false);

  if (!valid) {
    throw httpError(401, 'Mot de passe incorrect.', 'INVALID_CREDENTIALS');
  }

  if (!user.emailVerified) {
    await userRef.update({
      emailVerified: true,
      emailVerifiedAt: FieldValue.serverTimestamp(),
      emailVerificationMethod: 'password_confirmation',
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  const updated = await userRef.get();

  return {
    message: 'Compte vérifié avec succès.',
    user: safeUser(uid, updated.data())
  };
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
  if (!userSnap.exists) return null;
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
      to: email, subject: 'Réinitialisation du mot de passe Pal',
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


// Prépare l'activation de la double authentification.
export async function beginTwoFactorSetup(uid, currentPassword) {
  requireFirebase();

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw httpError(404, 'Compte introuvable.', 'USER_NOT_FOUND');
  }

  const user = userSnap.data();

  if (!user.passwordHash || !await argon2.verify(user.passwordHash, currentPassword).catch(() => false)) {
    throw httpError(401, 'Mot de passe actuel incorrect.', 'INVALID_CREDENTIALS');
  }

  if (user.twoFactorEnabled) {
    throw httpError(409, 'La double authentification est déjà activée.', 'TOTP_ALREADY_ENABLED');
  }

  const enrollment = await createTotpEnrollment(userSnap.data().email);
  const encryptedSecret = encryptTotpSecret(enrollment.secret);

  await userRef.update({
    totpPendingSecret: encryptedSecret,
    totpPendingExpiresAt: Date.now() + 10 * 60 * 1000,
    updatedAt: FieldValue.serverTimestamp()
  });

  return {
    qrCode: enrollment.qrCode,
    manualEntryKey: enrollment.manualEntryKey,
    expiresIn: 600
  };
}

// Confirme l'activation après vérification du premier code TOTP.
export async function confirmTwoFactorSetup(uid, code) {
  requireFirebase();

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw httpError(404, 'Compte introuvable.', 'USER_NOT_FOUND');
  }

  const user = userSnap.data();

  if (user.twoFactorEnabled) {
    throw httpError(409, 'La double authentification est déjà activée.', 'TOTP_ALREADY_ENABLED');
  }

  if (
    !user.totpPendingSecret ||
    !user.totpPendingExpiresAt ||
    user.totpPendingExpiresAt <= Date.now()
  ) {
    throw httpError(400, 'La configuration 2FA a expiré. Recommencez.', 'TOTP_SETUP_EXPIRED');
  }

  const secret = decryptTotpSecret(user.totpPendingSecret);

  if (!verifyTotpCode(secret, code)) {
    throw httpError(400, 'Code de vérification incorrect.', 'INVALID_TOTP_CODE');
  }

  const recovery = createRecoveryCodes();

  await db.runTransaction(async tx => {
    const latest = await tx.get(userRef);

    if (
      !latest.exists ||
      latest.data().twoFactorEnabled ||
      !latest.data().totpPendingSecret ||
      latest.data().totpPendingExpiresAt <= Date.now()
    ) {
      throw httpError(409, 'La configuration 2FA a changé. Recommencez.', 'TOTP_SETUP_CHANGED');
    }

    tx.update(userRef, {
      twoFactorEnabled: true,
      totpSecret: user.totpPendingSecret,
      totpRecoveryHashes: recovery.hashes,
      totpPendingSecret: FieldValue.delete(),
      totpPendingExpiresAt: FieldValue.delete(),
      twoFactorEnabledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return {
    message: 'La double authentification est maintenant activée.',
    recoveryCodes: recovery.codes
  };
}


// Termine une connexion après validation du deuxième facteur.
export async function verifyLoginTwoFactor(challengeToken, code) {
  requireFirebase();

  if (!challengeToken) {
    throw httpError(401, 'Défi de connexion absent.', 'TWO_FACTOR_CHALLENGE_INVALID');
  }

  const challengeRef = db.collection('authTwoFactorChallenges').doc(sha(challengeToken));
  const challengeSnap = await challengeRef.get();

  if (!challengeSnap.exists) {
    throw httpError(401, 'Défi de connexion invalide.', 'TWO_FACTOR_CHALLENGE_INVALID');
  }

  const challenge = challengeSnap.data();

  if (challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
    await challengeRef.delete();
    throw httpError(401, 'Défi de connexion expiré.', 'TWO_FACTOR_CHALLENGE_EXPIRED');
  }

  const userRef = db.collection('users').doc(challenge.uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists || !userSnap.data().twoFactorEnabled || !userSnap.data().totpSecret) {
    await challengeRef.delete();
    throw httpError(401, 'Configuration 2FA invalide.', 'TWO_FACTOR_INVALID');
  }

  const user = userSnap.data();
  const secret = decryptTotpSecret(user.totpSecret);
  const totpValid = verifyTotpCode(secret, code);
  const recoveryIndex = totpValid
    ? -1
    : verifyRecoveryCode(code, user.totpRecoveryHashes || []);

  if (!totpValid && recoveryIndex === -1) {
    const attempts = challenge.attempts + 1;

    if (attempts >= 5) {
      await challengeRef.delete();
    } else {
      await challengeRef.update({ attempts });
    }

    throw httpError(401, 'Code de vérification incorrect.', 'INVALID_TWO_FACTOR_CODE');
  }

  const sessionToken = token();
  const sessionRef = db.collection('authSessions').doc(sha(sessionToken));

  await db.runTransaction(async tx => {
    const latestChallenge = await tx.get(challengeRef);
    const latestUser = await tx.get(userRef);

    if (
      !latestChallenge.exists ||
      !latestUser.exists ||
      latestChallenge.data().expiresAt <= Date.now() ||
      latestChallenge.data().attempts >= 5 ||
      !latestUser.data().twoFactorEnabled
    ) {
      throw httpError(401, 'Défi de connexion expiré ou invalide.', 'TWO_FACTOR_CHALLENGE_INVALID');
    }

    const latest = latestUser.data();

    if (recoveryIndex !== -1) {
      const hashes = [...(latest.totpRecoveryHashes || [])];
      const currentIndex = verifyRecoveryCode(code, hashes);

      if (currentIndex === -1) {
        throw httpError(401, 'Code de récupération déjà utilisé.', 'RECOVERY_CODE_USED');
      }

      hashes.splice(currentIndex, 1);

      tx.update(userRef, {
        totpRecoveryHashes: hashes,
        updatedAt: FieldValue.serverTimestamp()
      });
    } else {
      const latestSecret = decryptTotpSecret(latest.totpSecret);

      if (!verifyTotpCode(latestSecret, code)) {
        throw httpError(401, 'Code de vérification incorrect.', 'INVALID_TWO_FACTOR_CODE');
      }
    }

    tx.delete(challengeRef);

    tx.set(sessionRef, {
      uid: challenge.uid,
      expiresAt: Date.now() + SESSION_DAYS * 86400000,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  const finalUser = await userRef.get();

  return {
    sessionToken,
    maxAge: SESSION_DAYS * 86400000,
    user: safeUser(challenge.uid, finalUser.data())
  };
}


// Vérifie le mot de passe et le second facteur avant une opération sensible.
async function verifyTwoFactorManagement(uid, currentPassword, code) {
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    throw httpError(404, 'Compte introuvable.', 'USER_NOT_FOUND');
  }

  const user = snap.data();

  if (!user.twoFactorEnabled || !user.totpSecret) {
    throw httpError(400, 'La double authentification est désactivée.', 'TOTP_NOT_ENABLED');
  }

  const passwordValid = await argon2.verify(
    user.passwordHash || '',
    currentPassword
  ).catch(() => false);

  if (!passwordValid) {
    throw httpError(401, 'Mot de passe actuel incorrect.', 'INVALID_CREDENTIALS');
  }

  const secret = decryptTotpSecret(user.totpSecret);
  const totpValid = verifyTotpCode(secret, code);
  const recoveryIndex = totpValid
    ? -1
    : verifyRecoveryCode(code, user.totpRecoveryHashes || []);

  if (!totpValid && recoveryIndex === -1) {
    throw httpError(401, 'Code de vérification incorrect.', 'INVALID_TWO_FACTOR_CODE');
  }

  return { userRef, recoveryIndex, code, totpValid };
}

// Désactive la double authentification après une double vérification.
export async function disableTwoFactor(uid, currentPassword, code) {
  requireFirebase();

  const verified = await verifyTwoFactorManagement(uid, currentPassword, code);

  await db.runTransaction(async tx => {
    const latest = await tx.get(verified.userRef);

    if (!latest.exists || !latest.data().twoFactorEnabled) {
      throw httpError(409, 'La configuration 2FA a changé.', 'TOTP_STATE_CHANGED');
    }

    if (verified.recoveryIndex !== -1) {
      const hashes = [...(latest.data().totpRecoveryHashes || [])];
      const index = verifyRecoveryCode(verified.code, hashes);

      if (index === -1) {
        throw httpError(401, 'Code de récupération déjà utilisé.', 'RECOVERY_CODE_USED');
      }

      hashes.splice(index, 1);
    } else {
      const secret = decryptTotpSecret(latest.data().totpSecret);

      if (!verifyTotpCode(secret, verified.code)) {
        throw httpError(401, 'Code TOTP invalide.', 'INVALID_TWO_FACTOR_CODE');
      }
    }

    tx.update(verified.userRef, {
      twoFactorEnabled: false,
      totpSecret: FieldValue.delete(),
      totpRecoveryHashes: FieldValue.delete(),
      twoFactorEnabledAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return { message: 'La double authentification a été désactivée.' };
}

// Remplace tous les anciens codes de récupération.
export async function regenerateTwoFactorRecoveryCodes(uid, currentPassword, code) {
  requireFirebase();

  const verified = await verifyTwoFactorManagement(uid, currentPassword, code);
  const recovery = createRecoveryCodes();

  await db.runTransaction(async tx => {
    const latest = await tx.get(verified.userRef);

    if (!latest.exists || !latest.data().twoFactorEnabled) {
      throw httpError(409, 'La configuration 2FA a changé.', 'TOTP_STATE_CHANGED');
    }

    if (verified.recoveryIndex !== -1) {
      const hashes = [...(latest.data().totpRecoveryHashes || [])];
      const index = verifyRecoveryCode(verified.code, hashes);

      if (index === -1) {
        throw httpError(401, 'Code de récupération déjà utilisé.', 'RECOVERY_CODE_USED');
      }
    } else {
      const secret = decryptTotpSecret(latest.data().totpSecret);

      if (!verifyTotpCode(secret, verified.code)) {
        throw httpError(401, 'Code TOTP invalide.', 'INVALID_TWO_FACTOR_CODE');
      }
    }

    tx.update(verified.userRef, {
      totpRecoveryHashes: recovery.hashes,
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return {
    message: 'Les codes de récupération ont été renouvelés.',
    recoveryCodes: recovery.codes
  };
}
