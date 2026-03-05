/**
 * Express backend proxy for the PDF Signing App.
 *
 * Endpoints:
 *   GET  /api/download-pdf?rid=...              → streams PDF from Foundry
 *   POST /api/upload-pdf?filename=...           → stores signed PDF in MongoDB, returns { id }
 *   GET  /api/download-signed-pdf/:id           → Foundry calls this to retrieve the signed PDF
 *
 * Static files: serves dist/ for the React app
 */

import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import { connectDb, storePdf, getPdf } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Foundry config (from environment, never sent to browser) ─────────────────
const STACK = process.env.VITE_FOUNDRY_STACK ?? "";
const CLIENT_ID = process.env.VITE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.VITE_CLIENT_SECRET ?? "";

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
        const arrayBuffer = await foundryRes.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error("[download-pdf]", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/upload-pdf?filename=signed_document.pdf
 * Stores the signed PDF in MongoDB and returns a unique ID.
 * Body: raw binary (application/octet-stream)
 * Response: { id }
 */
app.post(
    "/api/upload-pdf",
    express.raw({ type: "application/octet-stream", limit: "100mb" }),
    async (req, res) => {
        const { filename = "signed_document.pdf" } = req.query;
        try {
            const id = await storePdf(req.body, filename);
            res.json({ id });
        } catch (err) {
            console.error("[upload-pdf]", err);
            res.status(500).json({ error: err.message });
        }
    }
);

/**
 * GET /api/download-signed-pdf/:id
 * Public endpoint — Foundry calls this to download the signed PDF.
 * Returns raw PDF bytes, or 404 if not found / expired.
 */
app.get("/api/download-signed-pdf/:id", async (req, res) => {
    try {
        const result = await getPdf(req.params.id);
        if (!result) return res.status(404).json({ error: "PDF not found or expired" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
        res.send(Buffer.from(result.pdfData));
    } catch (err) {
        console.error("[download-signed-pdf]", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Foundry Action config (from environment) ─────────────────────────────────
const ONTOLOGY_API_NAME = process.env.FOUNDRY_ONTOLOGY_API_NAME ?? "";
const ACTION_API_NAME = process.env.FOUNDRY_ACTION_API_NAME ?? "";

/**
 * POST /api/apply-action
 * Triggers the Foundry Action Type to attach the signed PDF to the Files object.
 * Body: { uuid: string, filesObjectPrimaryKey: string }
 */
app.post("/api/apply-action", async (req, res) => {
    const { uuid, filesObjectPrimaryKey } = req.body;
    if (!uuid || !filesObjectPrimaryKey) {
        return res.status(400).json({ error: "uuid and filesObjectPrimaryKey are required" });
    }
    if (!ONTOLOGY_API_NAME || !ACTION_API_NAME) {
        return res.status(500).json({ error: "Foundry Action env vars not configured" });
    }

    try {
        const token = await getToken();
        const actionUrl = `${STACK}/api/v2/ontologies/${encodeURIComponent(ONTOLOGY_API_NAME)}/actions/${encodeURIComponent(ACTION_API_NAME)}/apply`;

        const actionRes = await fetch(actionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                parameters: {
                    fileObject: filesObjectPrimaryKey,
                    uuid: uuid,
                },
            }),
        });

        if (!actionRes.ok) {
            const errBody = await actionRes.text();
            console.error("[apply-action] Foundry error:", actionRes.status, errBody);
            return res.status(actionRes.status).json({ error: `Foundry action failed: ${errBody}` });
        }

        const result = await actionRes.json();
        console.log("[apply-action] Success:", JSON.stringify(result));
        res.json(result);
    } catch (err) {
        console.error("[apply-action]", err);
        res.status(500).json({ error: err.message });
    }
});

// ── Serve React static bundle ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));
app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ── Start (connect to MongoDB first, then listen) ────────────────────────────
const PORT = process.env.PORT ?? 3000;

(async () => {
    await connectDb();
    app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
})();
