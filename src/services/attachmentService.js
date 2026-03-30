/**
 * Attachment service — calls the Express backend proxy at /api/*.
 * The backend handles auth and forwards to Foundry server-to-server (no CORS).
 */

/**
 * Download a PDF from Foundry via the backend proxy.
 * @param {string} primaryKey
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadPdf(primaryKey) {
    const res = await fetch(`/api/download-pdf?primaryKey=${encodeURIComponent(primaryKey)}`);
    if (!res.ok) throw new Error(`Failed to download PDF (HTTP ${res.status})`);
    return await res.arrayBuffer();
}

/**
 * Upload the signed PDF to the server (stored in MongoDB).
 * @param {Uint8Array | ArrayBuffer} pdfBytes
 * @param {string} filename
 * @returns {Promise<string>} unique ID for retrieval
 */
export async function uploadSignedPdf(pdfBytes, filename = "signed_document.pdf") {
    const res = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([pdfBytes], { type: "application/pdf" }),
    });
    if (!res.ok) throw new Error(`Failed to upload PDF (HTTP ${res.status})`);
    const data = await res.json();
    return data.id;
}

/**
 * Trigger the Foundry Action to attach the signed PDF to the Files object.
 * @param {string} uuid — the signed PDF's unique ID in MongoDB
 * @param {string} filesObjectPrimaryKey — primary key of the Files object
 * @returns {Promise<object>} Foundry action result
 */
export async function applyAttachAction(uuid, filesObjectPrimaryKey) {
    const res = await fetch("/api/apply-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, filesObjectPrimaryKey }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Action failed (HTTP ${res.status})`);
    }
    return await res.json();
}

/**
 * Sends an email invite to a participant to sign the document.
 * @param {string} email
 * @param {string} primaryKey
 */
export async function sendParticipantEmail(email, primaryKey) {
    const res = await fetch("/api/invite-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, primaryKey }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to send email (HTTP ${res.status})`);
    }
    return await res.json();
}
