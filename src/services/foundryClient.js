// Foundry platform client using the official @osdk/client + @osdk/oauth SDKs.
// In dev mode (VITE_DEV_MODE=true) this module is never used.
import { createPlatformClient } from "@osdk/client";
import { createPublicOauthClient } from "@osdk/oauth";

const stack = import.meta.env.VITE_FOUNDRY_STACK ?? "";
const clientId = import.meta.env.VITE_CLIENT_ID ?? "";
const redirectUrl = window.location.origin;

let _client = null;

export function getClient() {
    if (!_client) {
        if (!stack || !clientId) {
            throw new Error(
                "VITE_FOUNDRY_STACK and VITE_CLIENT_ID must be set in .env"
            );
        }
        const auth = createPublicOauthClient(clientId, stack, redirectUrl);
        _client = createPlatformClient(stack, auth);
    }
    return _client;
}
