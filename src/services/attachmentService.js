/**
 * Attachment service — upload and download PDFs via the Foundry v2 Attachments API.
 *
 * Upload: POST /api/v2/ontologies/attachments/upload?filename=...
 *   → returns { rid, filename, sizeBytes, mediaType }
 *
 * Download content: GET /api/v1/attachments/{rid}/content
 *   (v2 only has metadata; v1 is still the correct endpoint for binary download)
 *
 * Ref: https://www.palantir.com/docs/foundry/api/v2/ontologies-v2-resources/attachments/upload-attachment/
 */
import { authHeaders } from "./foundryClient.js";

const STACK = import.meta.env.VITE_FOUNDRY_STACK ?? "";

/**
 * Upload a PDF to Foundry's attachment store.
 * Returns the attachment RID which can be used to set it on an ontology object property.
 *
 * @param {Uint8Array | ArrayBuffer} pdfBytes
 * @param {string} filename
 * @returns {Promise<string>} attachment RID  (e.g. "ri.attachments.main.attachment.xxx")
 */
export async function uploadSignedPdf(pdfBytes, filename = "signed_document.pdf") {
    const headers = await authHeaders();

    // POST /api/v2/ontologies/attachments/upload?filename=...
    const url = `${STACK}/api/v2/ontologies/attachments/upload?filename=${encodeURIComponent(filename)}`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/octet-stream",
        },
        body: new Blob([pdfBytes], { type: "application/pdf" }),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Failed to upload attachment (HTTP ${res.status}): ${detail}`);
    }

    const data = await res.json();
    // Response: { rid, filename, sizeBytes, mediaType }
    return data.rid;
}

/**
 * Get attachment metadata by RID (filename, size, mediaType).
 * Does NOT return the binary content — use downloadPdf for that.
 *
 * @param {string} attachmentRid
 * @returns {Promise<{ rid, filename, sizeBytes, mediaType }>}
 */
export async function getAttachmentMetadata(attachmentRid) {
    const headers = await authHeaders();

    // GET /api/v2/ontologies/attachments/{rid}
    const url = `${STACK}/api/v2/ontologies/attachments/${encodeURIComponent(attachmentRid)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to get attachment metadata (HTTP ${res.status})`);
    return await res.json();
}

/**
 * Download the binary content of an attachment.
 * Uses v1 API — v2 only provides metadata, not binary content.
 *
 * @param {string} attachmentRid
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadPdf(attachmentRid) {
    const headers = await authHeaders();

    // GET /api/v1/attachments/{rid}/content  (binary download)
    const url = `${STACK}/api/v1/attachments/${encodeURIComponent(attachmentRid)}/content`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to download attachment (HTTP ${res.status})`);
    return await res.arrayBuffer();
}
