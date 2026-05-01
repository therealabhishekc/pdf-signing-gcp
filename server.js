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
import { google } from "googleapis";
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
    attachPdfViaOsdkProspect,
    attachPdfViaOsdkForSalesRep,
    OCrmDocumentParticipants,
    createOcrmDocumentParticipants,
    editOcrmDocumentParticipants,
    deleteOcrmDocumentParticipants 
} from "@testing-pdf/sdk";
/* eslint-enable import/no-unresolved */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Gmail API setup ──────────────────────────────────────────────────────────
// Using a Service Account JSON Key explicitly for Domain-Wide Delegation
const rawPrivateKey = process.env.GCP_PRIVATE_KEY || "";
// If the key is loaded from an env var, we must unescape the newlines
const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

const auth = new google.auth.JWT(
    process.env.GCP_SERVICE_ACCOUNT_EMAIL || "email-sender@pdf-signing-494118.iam.gserviceaccount.com",
    null,
    privateKey,
    ["https://www.googleapis.com/auth/gmail.send"],
    process.env.GMAIL_DELEGATED_USER || "abhishek.chandrashekher@aavya.com"
);
const gmail = google.gmail({ version: "v1", auth });

// Helper to construct base64url encoded MIME email
function createMimeMessage(to, from, subject, htmlContent, textContent) {
    const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2)}@aavya.com>`;
    const dateStr = new Date().toUTCString();
    
    const message = [
        `To: ${to}`,
        `From: ${from}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
        `Message-ID: ${messageId}`,
        `Date: ${dateStr}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/alternative; boundary="boundary-string"`,
        ``,
        `--boundary-string`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        textContent,
        ``,
        `--boundary-string`,
        `Content-Type: text/html; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        htmlContent,
        ``,
        `--boundary-string--`
    ].join("\n");

    return Buffer.from(message)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// Trust Render's load balancer so express-rate-limit can read the real client IP
app.set("trust proxy", 1);

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
            
            // Hard revocation check — if the participant record was deleted from Palantir,
            // deny access immediately. This invalidates the link the moment they are removed.
            if (decoded.participantId) {
                try {
                    const participant = await withRetry(() => client(OCrmDocumentParticipants).fetchOne(decoded.participantId));
                    if (!participant) {
                        return res.status(403).json({ error: "Your access to this document has been revoked." });
                    }
                    if (participant.isSigned) {
                        isParticipantSigned = true;
                    }
                } catch (e) {
                    // fetchOne throws when the object doesn't exist — treat as revoked
                    console.warn("[download-pdf] Participant record not found — access revoked:", e.message);
                    return res.status(403).json({ error: "Your access to this document has been revoked." });
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
    const { primaryKey, token, filename = "signed_document.pdf", workshopRole = "Prospect" } = req.body;

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

        // For participant flows (token present), workshopRole is not applicable —
        // they always attach to the parent OCrmDocument regardless of which Workshop loaded it.
        // For Workshop users, route to the correct action based on role.
        const isParticipantUpload = !!(token && token !== "null" && token !== "undefined");
        let actionToRun;
        if (isParticipantUpload) {
            // Participants just need to attach the PDF — use Prospect action as the default
            actionToRun = workshopRole === "Sales Rep" ? attachPdfViaOsdkForSalesRep : attachPdfViaOsdkProspect;
        } else {
            actionToRun = workshopRole === "Sales Rep" ? attachPdfViaOsdkForSalesRep : attachPdfViaOsdkProspect;
        }

        const actionResult = await withRetry(() =>
            client(actionToRun).applyAction({
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

        const fromEmail = process.env.GMAIL_FROM_ADDRESS || "confidential@aavya.com";
        const fromName  = "Aavya Document Portal";
        const fromHeader = `"${fromName}" <${fromEmail}>`;
        const subject = "Action Required: You've been invited to sign a document";

        const textContent = `Hi,\n\nYou have been invited to review and sign a document via the Aavya secure portal.\n\nClick the link below to get started:\n${inviteLink}\n\nThis link will expire in 7 days.\n\nIf you were not expecting this invitation, you can safely ignore this email.\n\n— The Aavya Team`;

        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Document Signature Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a56db;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Aavya Document Portal</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">You have a document to sign</h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                You've been invited to review and sign a document securely via the Aavya portal.
                Click the button below to get started.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#1a56db;">
                    <a href="${inviteLink}"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Review &amp; Sign Document →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
                Or copy and paste this link into your browser:<br/>
                <a href="${inviteLink}" style="color:#1a56db;word-break:break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"/></td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                This link will expire in <strong>7 days</strong>.<br/>
                If you were not expecting this invitation, you can safely ignore this email.<br/><br/>
                © ${new Date().getFullYear()} Aavya. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const rawMessage = createMimeMessage(email, fromHeader, subject, htmlContent, textContent);

        const response = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw: rawMessage }
        });

        console.log(`[participants/add] Email successfully queued. Payload Header:`, response.data.id);
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
            email: participant.email,
            documentId: participant.documentId,
        }));
        
        res.json({ success: true });
    } catch (e) {
        console.error("[mark-signed] Error:", e?.message, JSON.stringify(e?.cause || e?.body || ""));
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
