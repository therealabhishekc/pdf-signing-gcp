/**
 * Attachment service — calls the Express backend proxy at /api/*.
 * The backend handles auth and forwards to Foundry server-to-server (no CORS).
 */

/**
 * Download a PDF from Foundry via the backend proxy.
 * @param {string} primaryKey
 * @param {string|null} token (optional) JWT token for external participant access
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadPdf(primaryKey, token = null) {
    let url = `/api/download-pdf?primaryKey=${encodeURIComponent(primaryKey)}`;
    if (token) url += `&token=${encodeURIComponent(token)}`;

    const res = await fetch(url);
    if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
            const errData = await res.json();
            if (errData.error) errMsg = errData.error;
        } catch (e) {
            // ignore JSON parse error
        }
        throw new Error(`Failed to download PDF: ${errMsg}`);
    }
    return await res.arrayBuffer();
}

/**
 * Upload the signed PDF directly to the backend proxy via FormData.
 * The proxy handles sending it immediately to Foundry via OSDK.
 * @param {string} primaryKey
 * @param {Blob} pdfBlob
 * @param {string} filename
 * @param {string|null} token
 */
export async function submitSignedPdf(primaryKey, pdfBlob, filename = "signed_document.pdf", token = null) {
    const formData = new FormData();
    formData.append("pdf", pdfBlob, filename);
    formData.append("primaryKey", primaryKey);
    formData.append("filename", filename);
    if (token) formData.append("token", token);

    const res = await fetch("/api/sign-and-attach", {
        method: "POST",
        body: formData,
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed (HTTP ${res.status})`);
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
