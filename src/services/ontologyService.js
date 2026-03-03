/**
 * Ontology service — calls the Express backend proxy at /api/attach-to-object.
 * The backend handles auth + Foundry PATCH server-to-server (no CORS).
 */

/**
 * Upload signed PDF and link it to a Files object's attachment property.
 * (Both steps handled inside server.js via /api/upload-pdf + /api/attach-to-object)
 *
 * @param {string}                  objectPrimaryKey  Primary key of the Files object.
 * @param {Uint8Array|ArrayBuffer}  signedPdfBytes    Signed PDF bytes.
 * @param {string}                  filename
 * @returns {Promise<string>}  The new attachment RID.
 */
export async function attachSignedPdfToFileObject(objectPrimaryKey, signedPdfBytes, filename = "signed_document.pdf") {
    // Step 1: Upload the PDF → get attachment RID
    const uploadRes = await fetch(`/api/upload-pdf?filename=${encodeURIComponent(filename)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([signedPdfBytes], { type: "application/pdf" }),
    });
    if (!uploadRes.ok) throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
    const { rid: attachmentRid } = await uploadRes.json();

    console.log(`📎 Uploaded → attachment RID: ${attachmentRid}`);

    // Step 2: Link the RID to Files[pk].attachment
    const patchRes = await fetch("/api/attach-to-object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPrimaryKey, attachmentRid }),
    });
    if (!patchRes.ok) {
        const detail = await patchRes.json().catch(() => ({}));
        throw new Error(`Failed to link attachment to object (HTTP ${patchRes.status}): ${JSON.stringify(detail)}`);
    }

    console.log(`✅ Files[${objectPrimaryKey}].attachment → ${attachmentRid}`);
    return attachmentRid;
}

/**
 * Get attachment metadata by RID (via backend proxy — calls Foundry v2 API).
 * @param {string} attachmentRid
 * @returns {Promise<{ rid, filename, sizeBytes, mediaType }>}
 */
export async function getAttachment(attachmentRid) {
    const res = await fetch(`/api/attachment-metadata?rid=${encodeURIComponent(attachmentRid)}`);
    if (!res.ok) throw new Error(`Failed to get attachment (HTTP ${res.status})`);
    return await res.json();
}
