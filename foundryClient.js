import { createClient } from "@osdk/client";
import { createConfidentialOauthClient } from "@osdk/oauth";

// Load from environment or use existing VITE_ fallbacks for compatibility
const FOUNDRY_URL = process.env.FOUNDRY_URL || process.env.VITE_FOUNDRY_STACK || "https://aavya.palantirfoundry.com";
const CLIENT_ID = process.env.FOUNDRY_CLIENT_ID || process.env.VITE_CLIENT_ID;
const CLIENT_SECRET = process.env.FOUNDRY_CLIENT_SECRET || process.env.VITE_CLIENT_SECRET;
const ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_RID || "ri.ontology.main.ontology.2b524aaa-b15b-49c6-9b69-353f71badbaf";

if (!FOUNDRY_URL || !CLIENT_ID || !CLIENT_SECRET) {
    console.warn("⚠️ OSDK Initialized without full credentials. API calls may fail.");
}

const scopes = [
	"api:use-ontologies-read",
	"api:use-ontologies-write",
	"api:use-admin-read",
	"api:use-admin-write",
	"api:use-datasets-read",
	"api:use-datasets-write",
	"api:use-filesystem-read",
	"api:use-filesystem-write",
	"api:use-aip-agents-read",
	"api:use-aip-agents-write",
	"api:use-streams-read",
	"api:use-streams-write",
	"api:use-connectivity-read",
	"api:use-connectivity-write",
	"api:use-connectivity-execute",
	"api:use-orchestration-read",
	"api:use-orchestration-write",
	"api:use-mediasets-read",
	"api:use-mediasets-write",
	"api:use-mediasets-transform",
	"api:use-sql-queries-read",
	"api:use-sql-queries-execute",
	"api:use-language-models-execute",
	"api:use-audit-read",
	"api:use-models-read",
	"api:use-models-write",
	"api:use-models-execute",
	"api:use-checkpoints-read"
];

const authClient = createConfidentialOauthClient(
    CLIENT_ID,
    CLIENT_SECRET,
    FOUNDRY_URL,
    scopes
);

const client = createClient(
    FOUNDRY_URL,
    ONTOLOGY_RID,
    authClient
);

export default client;
