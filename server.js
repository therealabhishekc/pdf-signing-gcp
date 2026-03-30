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
import nodemailer from "nodemailer";
import { connectDb, storePdf, getPdf } from "./db.js";
import client from "./foundryClient.js";
// Note: In real setup, you would have ran: npm install @testing-pdf/sdk
// Since it's a private Foundry package, we import what we can or rely on standard structures.
// We disable eslint for unresolved imports here so we don't crash if the module isn't strictly found during linting.
/* eslint-disable import/no-unresolved */
// @ts-ignore
import { OCrmDocument, aattachPdfViaOsdk } from "@testing-pdf/sdk";
/* eslint-enable import/no-unresolved */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Nodemailer setup ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "absk.pihole@gmail.com",
        pass: "Absk@1234",
    },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// ── API routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/download-pdf?primaryKey=xxx
 * Downloads a PDF attachment from Foundry using OSDK.
 */
app.get("/api/download-pdf", async (req, res) => {
    const { primaryKey } = req.query;
    if (!primaryKey) return res.status(400).json({ error: "primaryKey is required" });

    try {
        const doc = await client(OCrmDocument).fetchOne(primaryKey);
        
        const attachmentRef = doc.document;
        if (!attachmentRef) {
            return res.status(404).json({ error: "No PDF attached to this document." });
        }

        const metadata = await attachmentRef.fetchMetadata();
        const contentRes = await attachmentRef.fetchContents();
        const arrayBuffer = await contentRes.arrayBuffer();

        res.setHeader("Content-Type", metadata.mediaType || "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${metadata.filename || "document.pdf"}"`);
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

/**
 * POST /api/apply-action
 * Triggers the Foundry Action via OSDK.
 * Body: { uuid: string, filesObjectPrimaryKey: string }
 */
app.post("/api/apply-action", async (req, res) => {
    const { uuid, filesObjectPrimaryKey } = req.body;
    if (!uuid || !filesObjectPrimaryKey) {
        return res.status(400).json({ error: "uuid and filesObjectPrimaryKey are required" });
    }

    try {
        const actionResult = await client(aattachPdfViaOsdk).applyAction({
            fileObject: filesObjectPrimaryKey,
            uuid: uuid,
        });
        console.log("[apply-action] Success:", actionResult);
        res.json({ success: true, result: actionResult });
    } catch (err) {
        console.error("[apply-action]", err);
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
        // Construct link (if deployed, this would use req.headers.host or an env var)
        const hostUrl = process.env.PUBLIC_URL || `http://${req.headers.host}`;
        const inviteLink = `${hostUrl}/?participant=true&pdfId=${encodeURIComponent(primaryKey)}`;

        const mailOptions = {
            from: "absk.pihole@gmail.com",
            to: email,
            subject: "You've been invited to sign a document",
            html: `
                <h3>Document Signature Request</h3>
                <p>You have been invited to sign a document in our secure portal.</p>
                <a href="${inviteLink}" style="padding:10px 15px; background: #007bff; color:white; text-decoration:none; border-radius:4px;">
                    Review and Sign Document
                </a>
                <p>Or copy this link: <br> ${inviteLink}</p>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("[invite-participant] Email sent: " + info.response);
        res.json({ success: true, link: inviteLink });
    } catch (error) {
        console.error("[invite-participant] E-mail send failed:", error);
        res.status(500).json({ error: "Failed to send email" });
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
