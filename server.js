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
import sgMail from "@sendgrid/mail";
import multer from "multer";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import client from "./foundryClient.js";
import { createAttachmentUpload } from "@osdk/client";
// Note: In real setup, you would have ran: npm install @testing-pdf/sdk
// Since it's a private Foundry package, we import what we can or rely on standard structures.
// We disable eslint for unresolved imports here so we don't crash if the module isn't strictly found during linting.
/* eslint-disable import/no-unresolved */
// @ts-ignore
import { OCrmDocument, attachPdfViaOsdk } from "@testing-pdf/sdk";
/* eslint-enable import/no-unresolved */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── SendGrid setup ────────────────────────────────────────────────────────
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: "Too many requests" },
});
app.use("/api/", apiLimiter);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function withRetry(fn, maxRetries = 3, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === maxRetries) throw err;
            const isTransient = err.status === 429 || err.status >= 500;
            if (!isTransient && err.status !== undefined) throw err;
            await new Promise(r => setTimeout(r, delayMs * attempt));
            console.log(`[withRetry] Attempt ${attempt} failed, retrying...`);
        }
    }
}

function isValidPdf(buffer) {
    const header = Buffer.from(buffer).slice(0, 5).toString();
    return header.startsWith("%PDF-");
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB Max
});

// ── API routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/download-pdf?primaryKey=xxx
 * Downloads a PDF attachment from Foundry using OSDK.
 */
app.get("/api/download-pdf", async (req, res) => {
    const { primaryKey, token } = req.query;
    if (!primaryKey) return res.status(400).json({ error: "primaryKey is required" });

    // Enforce JWT validation if a token is explicitly passed (Participant Link)
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.INVITE_SECRET || "default_dev_secret");
            if (decoded.primaryKey !== primaryKey) {
                return res.status(403).json({ error: "Token is not valid for this document" });
            }
        } catch (e) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
    }

    try {
        let doc;
        try {
            doc = await withRetry(() => client(OCrmDocument).fetchOne(primaryKey));
        } catch (e) {
            throw new Error(`Foundry Object with Primary Key '${primaryKey}' not found. (${e.message})`);
        }

        const attachmentRef = doc.document;
        if (!attachmentRef) {
            return res.status(404).json({ error: "No PDF attached to this document." });
        }

        let metadata, contentRes;
        try {
            metadata = await withRetry(() => attachmentRef.fetchMetadata());
            contentRes = await withRetry(() => attachmentRef.fetchContents());
        } catch (e) {
            throw new Error(`Failed to fetch attachment contents from Foundry: ${e.message}`);
        }

        res.setHeader("Content-Type", metadata.mediaType || "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${metadata.filename || "document.pdf"}"`);

        // Stream PDF contents directly instead of buffering in RAM
        if (contentRes.body && typeof contentRes.body.getReader === 'function') {
            const reader = contentRes.body.getReader();
            const pump = async () => {
                const { done, value } = await reader.read();
                if (done) { res.end(); return; }
                res.write(Buffer.from(value));
                return pump();
            };
            await pump();
        } else if (contentRes.body && contentRes.body.pipe) {
            contentRes.body.pipe(res);
        } else {
            const arrayBuffer = await contentRes.arrayBuffer();
             res.send(Buffer.from(arrayBuffer));
        }
    } catch (err) {
        console.error("[download-pdf]", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/sign-and-attach
 * Receives the signed PDF directly from the browser RAM and uploads it to Palantir.
 * Body: FormData containing { pdf (File), primaryKey, token, filename }
 */
app.post("/api/sign-and-attach", upload.single("pdf"), async (req, res) => {
    const { primaryKey, token, filename = "signed_document.pdf" } = req.body;

    if (!primaryKey) {
        return res.status(400).json({ error: "primaryKey is required" });
    }

    // JWT Verification (required if user accessed via a participant token)
    if (token && token !== "null" && token !== "undefined") {
        try {
            const decoded = jwt.verify(token, process.env.INVITE_SECRET || "default_dev_secret");
            if (decoded.primaryKey !== primaryKey) {
                return res.status(403).json({ error: "Token is not valid for this document" });
            }
        } catch (e) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
    }

    if (!req.file || !isValidPdf(req.file.buffer)) {
        return res.status(400).json({ error: "Invalid or missing PDF file." });
    }

    try {
        // Direct to Foundry — no MongoDB staging needed
        const blob = new Blob([req.file.buffer], { type: "application/pdf" });
        const attachment = createAttachmentUpload(blob, filename);

        const actionResult = await withRetry(() =>
            client(attachPdfViaOsdk).applyAction({
                ocrm_document: primaryKey,
                document: attachment,
            })
        );
        
        console.log("[sign-and-attach] Success:", actionResult);
        res.json({ success: true, result: actionResult });
    } catch (err) {
        console.error("[sign-and-attach]", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/invite-participant
 * Sends an email invite with realistic payload
 */
app.post("/api/invite-participant", async (req, res) => {
    const { email, primaryKey } = req.body;
    if (!email || !primaryKey) {
        return res.status(400).json({ error: "email and primaryKey are required" });
    }

    try {
        // Sign the link using JWT for 7 days
        const token = jwt.sign(
            { primaryKey, email },
            process.env.INVITE_SECRET || "default_dev_secret",
            { expiresIn: "7d" }
        );

        const hostUrl = process.env.PUBLIC_URL || `http://${req.headers.host}`;
        const inviteLink = `${hostUrl}/?participant=true&pdfId=${encodeURIComponent(primaryKey)}&token=${token}`;

        // Note: Unless you verify your custom domain, the 'from' email must EXACTLY match 
        // the single sender you verified in the SendGrid dashboard!
        const msg = {
            from: process.env.SENDGRID_FROM_EMAIL || "abhishek.chandrashekher@aavya.com",
            to: email,
            subject: "You've been invited to sign a document",
            html: `
                <h3>Document Signature Request</h3>
                <p>You have been invited to sign a document in our secure portal.</p>
                <a href="${inviteLink}" style="padding:10px 15px; background: #007bff; color:white; text-decoration:none; border-radius:4px; display:inline-block; margin: 10px 0;">
                    Review and Sign Document
                </a>
                <p>Or copy this link: <br> ${inviteLink}</p>
            `,
        };

        const response = await sgMail.send(msg);

        console.log(`[invite-participant] Email successfully queued by SendGrid. Payload Header:`, response[0].headers["x-message-id"]);
        res.json({ success: true, link: inviteLink });
    } catch (error) {
        console.error("[invite-participant] E-mail send failed:", error);
        
        // Enhance logging so SendGrid's native internal JSON errors surface to Render logs properly.
        if (error.response) {
            console.error(error.response.body);
        }

        res.status(500).json({ error: `SendGrid API Error: ${error.message || 'Timeout/Unknown'}` });
    }
});

// ── Serve React static bundle ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));
app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ── Start (connect to MongoDB first, then listen) ────────────────────────────
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
