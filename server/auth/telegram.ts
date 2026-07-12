import { createHmac } from 'node:crypto';

/**
 * Validates a Telegram Mini App initData string.
 * Returns the parsed user object on success, null on failure.
 * Algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initDataRaw: string,
  botToken: string,
): Record<string, unknown> | null {
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) return null;

    // Reject stale tokens older than 5 minutes
    const authDate = Number(params.get('auth_date') ?? 0);
    if (Date.now() / 1000 - authDate > 300) return null;

    const userJson = params.get('user');
    return userJson ? JSON.parse(userJson) : {};
  } catch {
    return null;
  }
}
