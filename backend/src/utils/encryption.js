import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Get encryption key from environment or generate a default one
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET || 'reactflux-ai-default-encryption-key';
  const salt = process.env.ENCRYPTION_SALT || 'reactflux-ai-salt';
  return scryptSync(secret, salt, 32);
}

/**
 * Encrypt a string value
 * @param {string} text - The text to encrypt
 * @returns {string} - Base64 encoded encrypted data (salt:iv:authTag:encrypted)
 */
export function encrypt(text) {
  if (!text) return null;

  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedData - The encrypted data (iv:authTag:encrypted format)
 * @returns {string} - Decrypted text
 */
export function decrypt(encryptedData) {
  if (!encryptedData) return null;

  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, encrypted] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Mask an API key for display
 * Shows first 4 and last 4 characters, masks the rest
 * @param {string} apiKey - The API key to mask
 * @returns {string} - Masked API key
 */
export function maskApiKey(apiKey) {
  if (!apiKey) return null;

  const key = String(apiKey);

  if (key.length <= 8) {
    return '****';
  }

  const first4 = key.slice(0, 4);
  const last4 = key.slice(-4);
  const maskedLength = Math.min(key.length - 8, 20);
  const masked = '*'.repeat(maskedLength);

  return `${first4}${masked}${last4}`;
}

export default {
  encrypt,
  decrypt,
  maskApiKey
};
