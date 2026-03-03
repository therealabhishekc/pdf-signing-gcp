/**
 * Foundry Client — Client Credentials Grant
 *
 * ⚠️  SECURITY WARNING:
 *     Client secrets must NOT be exposed in browser-side code in production.
 *     This implementation is suitable for internal/trusted environments only.
 *     For public production apps, proxy the token request through your
 *     Render backend so VITE_CLIENT_SECRET never reaches the browser.
 *
 * Flow:
 *   POST /multipass/api/oauth2/token (client_credentials)
 *     → { access_token, expires_in }
 *   All subsequent API calls use: Authorization: Bearer <access_token>
 */

const STACK = import.meta.env.VITE_FOUNDRY_STACK ?? "";
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID ?? "";
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET ?? "";

let _cachedToken = null;
let _tokenExpireAt = 0;

/**
 * Get a valid bearer token, using the cache when not expired.
 * @returns {Promise<string>}
 */
export async function getBearerToken() {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpireAt - 30_000) {
        return _cachedToken; // still fresh (with 30s safety margin)
    }

    const res = await fetch(`${STACK}/multipass/api/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Foundry token request failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    _cachedToken = data.access_token;
    _tokenExpireAt = now + (data.expires_in ?? 3600) * 1000;
    return _cachedToken;
}

/**
 * Convenience: build an Authorization header object.
 * @returns {Promise<{ Authorization: string }>}
 */
export async function authHeaders() {
    const token = await getBearerToken();
    return { Authorization: `Bearer ${token}` };
}
