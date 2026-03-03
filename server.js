/**
 * Express backend proxy for the PDF Signing App.
 *
 * Why this exists:
 *   Browsers block direct cross-origin fetch() calls to Foundry (CORS policy).
 *   This server sits between the browser and Foundry:
 *     Browser → /api/* (same-origin, no CORS) → Express → Foundry API
 *
 * Also keeps the client_secret out of the browser entirely.
 *
 * Endpoints:
 *   GET  /api/download-pdf?rid=...          → streams PDF bytes from Foundry
 *   POST /api/upload-pdf?filename=...       → uploads PDF to Foundry, returns { rid }
 *   POST /api/attach-to-object              → links attachment RID to Files object property
 *
 * Static files: serves dist/ for the React app
 */

import express from "express";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Foundry config (from environment, never sent to browser) ─────────────────
const STACK = process.env.VITE_FOUNDRY_STACK ?? "";
const CLIENT_ID = process.env.VITE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.VITE_CLIENT_SECRET ?? "";
const ONTOLOGY = process.env.VITE_ONTOLOGY_API_NAME ?? "ontology";
const OBJECT_TYPE = process.env.VITE_OBJECT_TYPE ?? "Files";
const ATTACH_PROP = process.env.VITE_DOCS_PROPERTY ?? "attachment";

// ── Token cache ───────────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpireAt = 0;

async function getToken() {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpireAt - 30_000) return _cachedToken;

    const res = await fetch(`${STACK}/multipass/api/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
        }),
    });

    if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
    const data = await res.json();
    _cachedToken = data.access_token;
    _tokenExpireAt = now + (data.expires_in ?? 3600) * 1000;
    return _cachedToken;
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/download-pdf?rid=ri.attachments.main.attachment.xxx
 * Downloads a PDF attachment from Foundry and streams it to the browser.
 */
app.get("/api/download-pdf", async (req, res) => {
    const { rid } = req.query;
    if (!rid) return res.status(400).json({ error: "rid is required" });

    try {
        const token = await getToken();
        const foundryRes = await fetch(
            `${STACK}/api/v1/attachments/${encodeURIComponent(rid)}/content`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!foundryRes.ok) {
            return res.status(foundryRes.status).json({ error: "Foundry download failed" });
        }
        res.setHeader("Content-Type", "application/pdf");
        // Stream the response body through
        const arrayBuffer = await foundryRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error("[download-pdf]", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/upload-pdf?filename=signed_document.pdf
 * Uploads a signed PDF to Foundry's attachment store.
 * Body: raw binary (application/octet-stream)
 * Response: { rid, filename, sizeBytes, mediaType }
 */
app.post(
    "/api/upload-pdf",
    express.raw({ type: "application/octet-stream", limit: "100mb" }),
    async (req, res) => {
        const { filename = "signed_document.pdf" } = req.query;
        try {
            const token = await getToken();
            const foundryRes = await fetch(
                `${STACK}/api/v2/ontologies/attachments/upload?filename=${encodeURIComponent(filename)}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/octet-stream",
                    },
                    body: req.body,
                }
            );
            const data = await foundryRes.json();
            if (!foundryRes.ok) return res.status(foundryRes.status).json(data);
            res.json(data); // { rid, filename, sizeBytes, mediaType }
        } catch (err) {
            console.error("[upload-pdf]", err);
            res.status(500).json({ error: err.message });
        }
    }
);

/**
 * POST /api/attach-to-object
 * Body: { objectPrimaryKey, attachmentRid }
 * Links the uploaded attachment to the Files object's attachment property.
 */
app.post("/api/attach-to-object", async (req, res) => {
    const { objectPrimaryKey, attachmentRid } = req.body ?? {};
    if (!objectPrimaryKey || !attachmentRid) {
        return res.status(400).json({ error: "objectPrimaryKey and attachmentRid are required" });
    }

    try {
        const token = await getToken();
        const url = `${STACK}/api/v2/ontologies/${encodeURIComponent(ONTOLOGY)}/objects/${encodeURIComponent(OBJECT_TYPE)}/${encodeURIComponent(objectPrimaryKey)}`;

        const foundryRes = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                properties: { [ATTACH_PROP]: { rid: attachmentRid } },
            }),
        });

        if (!foundryRes.ok) {
            const detail = await foundryRes.text().catch(() => "");
            return res.status(foundryRes.status).json({ error: detail });
        }

        res.json({ success: true, attachmentRid });
    } catch (err) {
        console.error("[attach-to-object]", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Serve React static bundle ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
