import { createClient } from "@osdk/client";
import { createConfidentialOauthClient } from "@osdk/oauth";

// Load from environment or use existing VITE_ fallbacks for compatibility
const FOUNDRY_URL = process.env.FOUNDRY_URL || process.env.VITE_FOUNDRY_STACK;
const CLIENT_ID = process.env.FOUNDRY_CLIENT_ID || process.env.VITE_CLIENT_ID;
const CLIENT_SECRET = process.env.FOUNDRY_CLIENT_SECRET || process.env.VITE_CLIENT_SECRET;
const ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_RID || "";

if (!FOUNDRY_URL || !CLIENT_ID || !CLIENT_SECRET) {
    console.warn("⚠️ OSDK Initialized without full credentials. API calls may fail.");
}

const authClient = createConfidentialOauthClient(
    CLIENT_ID,
    CLIENT_SECRET,
    FOUNDRY_URL
);

const client = createClient(
    FOUNDRY_URL,
    ONTOLOGY_RID,
    authClient
);

export default client;
