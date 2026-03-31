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
    const buffer = await res.arrayBuffer();
    const isSigned = res.headers.get("x-is-signed") === "true";
    return { buffer, isSigned };
}

/**
 * Upload the signed PDF directly to the backend proxy via FormData.
 * The proxy handles sending it immediately to Foundry via OSDK.
 * @param {string} primaryKey
 * @param {Blob} pdfBlob
 * @param {string} filename
 * @param {string} token - Optional participant JWT
 * @param {string} workshopRole - Optional role ('Prospect' | 'Sales Rep')
 */
export async function submitSignedPdf(primaryKey, pdfBlob, filename = "signed_document.pdf", token = null, workshopRole = "Prospect") {
    const formData = new FormData();
    formData.append("pdf", pdfBlob, filename);
    formData.append("primaryKey", primaryKey);
    formData.append("workshopRole", workshopRole);
    if (token) {
        formData.append("token", token);
    }

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
 * Adds a multi-signer participant and emails them the magic link.
 * @param {string} email
 * @param {string} documentId
 */
export async function addParticipant(email, documentId) {
    const res = await fetch("/api/participants/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, documentId }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to add participant (HTTP ${res.status})`);
    }
    return await res.json();
}

/**
 * Gets all participants for a specific document.
 * @param {string} documentId 
 */
export async function getParticipants(documentId) {
    const res = await fetch(`/api/participants?documentId=${encodeURIComponent(documentId)}`);
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch participants (HTTP ${res.status})`);
    }
    return await res.json();
}

/**
 * Marks an external participant as signed using their JWT Token.
 * @param {string} token 
 */
export async function markParticipantSigned(token) {
    const res = await fetch("/api/participants/mark-signed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to mark signed (HTTP ${res.status})`);
    }
    return await res.json();
}

/**
 * Deletes an external participant matching a primary key.
 * @param {string} participantId 
 */
export async function deleteParticipant(participantId) {
    const res = await fetch(`/api/participants/${encodeURIComponent(participantId)}`, {
        method: "DELETE",
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to delete participant (HTTP ${res.status})`);
    }
    return await res.json();
}
