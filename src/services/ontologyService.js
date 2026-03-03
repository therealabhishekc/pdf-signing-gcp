/**
 * Ontology Service — POST signed PDF binary directly to the Files object's
 * attachment property via the Express backend proxy.
 *
 * Server endpoint: POST /api/attach-to-object?primaryKey=...&filename=...
 * Server then calls:
 *   POST /api/v2/ontologies/{ont}/objects/{type}/{pk}/attachments/{property}
 *   Content-Type: application/octet-stream
 * This both uploads the file AND sets the attachment property in one call.
 */

/**
 * Upload signed PDF and set it directly on Files[primaryKey].attachment.
 *
 * @param {string}                  objectPrimaryKey
 * @param {Uint8Array|ArrayBuffer}  signedPdfBytes
 * @param {string}                  filename
 * @returns {Promise<string|null>}  New attachment RID (if returned by Foundry)
 */
export async function attachSignedPdfToFileObject(objectPrimaryKey, signedPdfBytes, filename = "signed_document.pdf") {
    const url = `/api/attach-to-object?primaryKey=${encodeURIComponent(objectPrimaryKey)}&filename=${encodeURIComponent(filename)}`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([signedPdfBytes], { type: "application/pdf" }),
    });

    if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(
            `Failed to attach PDF to object (HTTP ${res.status}): ${JSON.stringify(detail)}`
        );
    }

    const data = await res.json();
    console.log(`✅ Files[${objectPrimaryKey}].attachment updated`, data);
    return data.attachmentRid ?? null;
}
