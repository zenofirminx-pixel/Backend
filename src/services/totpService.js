import crypto from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { httpError } from '../utils/http.js';

// Tolérance d'une période de 30 secondes pour les différences d'horloge.
authenticator.options = { window: 1 };

function encryptionKey() {
  const value = env.totpEncryptionKey || '';

  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw httpError(
      503,
      'Le chiffrement de la 2FA n’est pas correctement configuré.',
      'TOTP_NOT_CONFIGURED'
    );
  }

  return Buffer.from(value, 'hex');
}

/**
 * Chiffre un secret TOTP avec AES-256-GCM.
 */
export function encryptTotpSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    encryptionKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final()
  ]);

  return {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url')
  };
}

/**
 * Déchiffre un secret TOTP.
 */
export function decryptTotpSecret(payload) {
  try {
    if (
      !payload ||
      payload.version !== 1 ||
      !payload.iv ||
      !payload.tag ||
      !payload.data
    ) {
      throw new Error('Invalid encrypted secret');
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(payload.iv, 'base64url')
    );

    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    throw httpError(
      500,
      'Impossible de déchiffrer le secret 2FA.',
      'TOTP_DECRYPTION_FAILED'
    );
  }
}

/**
 * Prépare un enrôlement TOTP et son QR code.
 */
export async function createTotpEnrollment(email) {
  const secret = authenticator.generateSecret();

  const uri = authenticator.keyuri(
    email,
    'OpenDC',
    secret
  );

  const qrCode = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256
  });

  return {
    secret,
    qrCode,
    manualEntryKey: secret
  };
}

/**
 * Vérifie un code TOTP.
 */
export function verifyTotpCode(secret, code) {
  const normalized = String(code || '').replace(/\s/g, '');

  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  return authenticator.check(normalized, secret);
}

/**
 * Hache un code de récupération.
 * Les codes générés sont aléatoires et possèdent une forte entropie.
 */
export function hashRecoveryCode(code) {
  const normalized = String(code || '')
    .replace(/-/g, '')
    .trim()
    .toUpperCase();

  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex');
}

/**
 * Génère dix codes de récupération à usage unique.
 */
export function createRecoveryCodes(count = 10) {
  const codes = Array.from(
    { length: count },
    () => {
      const value = crypto.randomBytes(10).toString('hex').toUpperCase();

      return value.match(/.{1,5}/g).join('-');
    }
  );

  return {
    codes,
    hashes: codes.map(hashRecoveryCode)
  };
}

/**
 * Compare un code de récupération aux empreintes enregistrées.
 */
export function verifyRecoveryCode(code, storedHashes = []) {
  const candidate = Buffer.from(hashRecoveryCode(code), 'hex');

  return storedHashes.findIndex((stored) => {
    if (!/^[a-fA-F0-9]{64}$/.test(stored)) {
      return false;
    }

    const expected = Buffer.from(stored, 'hex');

    return crypto.timingSafeEqual(candidate, expected);
  });
}
