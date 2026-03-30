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
import { 
    OCrmDocument, 
    attachPdfViaOsdk,
    OCrmDocumentParticipants,
    createOcrmDocumentParticipants,
    editOcrmDocumentParticipants,
    deleteOcrmDocumentParticipants 
} from "@testing-pdf/sdk";
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

    let isParticipantSigned = false;

    // Enforce JWT validation if a token is explicitly passed (Participant Link)
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.INVITE_SECRET || "default_dev_secret");
            if (decoded.documentId !== primaryKey && decoded.primaryKey !== primaryKey) {
                return res.status(403).json({ error: "Token is not valid for this document" });
            }
            
            // If the participant explicitly has an ID, check if they signed
            if (decoded.participantId) {
                try {
                    const participant = await withRetry(() => client(OCrmDocumentParticipants).fetchOne(decoded.participantId));
                    if (participant && participant.isSigned) {
                        isParticipantSigned = true;
                    }
                } catch (e) {
                    console.log("[download-pdf] Participant fetch failed (might be legacy token)", e.message);
                }
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
        if (isParticipantSigned) res.setHeader("X-Is-Signed", "true");

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
            if (decoded.documentId !== primaryKey && decoded.primaryKey !== primaryKey) {
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
 * POST /api/participants/add
 * Replaces invite-participant. Creates participant object via Foundry Action then emails.
 */
app.post("/api/participants/add", async (req, res) => {
    const { email, primaryKey, documentId } = req.body;
    const docId = documentId || primaryKey;
    if (!email || !docId) return res.status(400).json({ error: "email and documentId are required" });

    try {
        const actionResult = await withRetry(() => client(createOcrmDocumentParticipants).applyAction({
            email,
            documentId: docId,
            isSigned: false,
            signatureDate: new Date().toISOString(),
        }, { $returnEdits: true }));

        let participantId;
        if (actionResult?.edits?.added?.[0]?.primaryKey) {
            participantId = actionResult.edits.added[0].primaryKey;
        } else {
            // Fallback retrieval logic
            await new Promise(r => setTimeout(r, 2000));
            const participantsRes = await withRetry(() => client(OCrmDocumentParticipants)
                .where({ documentId: { $eq: docId } })
                .fetchPage({ $pageSize: 100 })
            );
            const p = participantsRes.data.find(x => x.email === email);
            if (p) participantId = p.participantId || p.$primaryKey;
        }

        if (!participantId) {
            console.warn("[participants/add] Could not retrieve participantId, defaulting to email identifier inside JWT.");
        }

        // Sign the link using JWT for 7 days
        const token = jwt.sign(
            { participantId, documentId: docId, email }, // Encode participantId for strict targeting!
            process.env.INVITE_SECRET || "default_dev_secret",
            { expiresIn: "7d" }
        );

        const hostUrl = process.env.PUBLIC_URL || `http://${req.headers.host}`;
        const inviteLink = `${hostUrl}/?participant=true&pdfId=${encodeURIComponent(docId)}&token=${token}`;

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

        console.log(`[participants/add] Email successfully queued. Payload Header:`, response[0].headers["x-message-id"]);
        res.json({ success: true, link: inviteLink });
    } catch (error) {
        console.error("[participants/add] E-mail send failed:", error);
        if (error.response) console.error(error.response.body);
        res.status(500).json({ error: `Participant Add Error: ${error.message || 'Timeout/Unknown'}` });
    }
});

/**
 * GET /api/participants
 * List all participants for a specific document
 */
app.get("/api/participants", async (req, res) => {
    const { documentId, primaryKey } = req.query;
    const docId = documentId || primaryKey;
    if (!docId) return res.status(400).json({ error: "documentId is required" });

    try {
        const participants = await withRetry(() => client(OCrmDocumentParticipants)
            .where({ documentId: { $eq: docId } })
            .fetchPage({ $pageSize: 100 })
        );
        res.json({ participants: participants.data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/participants/mark-signed
 */
app.post("/api/participants/mark-signed", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token is required" });

    try {
        const decoded = jwt.verify(token, process.env.INVITE_SECRET || "default_dev_secret");
        const participantId = decoded.participantId;
        
        if (!participantId) return res.status(400).json({ error: "Token lacks participantId. Cannot mark signed." });

        const participant = await withRetry(() => client(OCrmDocumentParticipants).fetchOne(participantId));

        await withRetry(() => client(editOcrmDocumentParticipants).applyAction({
            OCrmDocumentParticipants: participantId,
            isSigned: true,
            signatureDate: new Date().toISOString(),
            email: participant.email,
            documentId: participant.documentId,
        }));
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * DELETE /api/participants/:participantId
 */
app.delete("/api/participants/:participantId", async (req, res) => {
    try {
        await withRetry(() => client(deleteOcrmDocumentParticipants).applyAction({
            OCrmDocumentParticipants: req.params.participantId,
        }));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
