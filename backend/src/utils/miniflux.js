import db from '../db/index.js';
import { decrypt } from './encryption.js';

/**
 * Get active Miniflux API credentials (decrypted).
 * @returns {{ apiUrl: string, apiKey: string } | null}
 */
export function getMinifluxCredentials() {
  const stmt = db.prepare('SELECT api_url, api_key_encrypted FROM miniflux_config WHERE is_active = 1 LIMIT 1');
  const row = stmt.get();
  if (!row || !row.api_url) return null;
  const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : null;
  if (!apiKey) return null;
  return {
    apiUrl: row.api_url.replace(/\/$/, ''),
    apiKey
  };
}
