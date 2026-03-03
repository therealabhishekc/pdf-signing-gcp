/**
 * Ontology Service — attach a signed PDF to a Files object's attachment property.
 *
 * Correct flow (per Foundry v2 API docs):
 *   Step 1: Upload PDF → POST /api/v2/ontologies/attachments/upload → get attachment RID
 *   Step 2: Set that RID on the object property via an Action or direct property write
 *
 * The upload endpoint returns: { rid, filename, sizeBytes, mediaType }
 * The RID is what gets stored as the value of the attachment property on the ontology object.
 *
 * Refs:
 *   https://www.palantir.com/docs/foundry/api/v2/ontologies-v2-resources/attachments/upload-attachment/
 *   https://www.palantir.com/docs/foundry/api/v2/ontologies-v2-resources/attachments/get-attachment/
 */
import { authHeaders } from "./foundryClient.js";

const STACK = import.meta.env.VITE_FOUNDRY_STACK ?? "";
const ONTOLOGY = import.meta.env.VITE_ONTOLOGY_API_NAME ?? "ontology";
const OBJECT_TYPE = import.meta.env.VITE_OBJECT_TYPE ?? "Files";
const ATTACH_PROP = import.meta.env.VITE_DOCS_PROPERTY ?? "attachment";

/**
 * Upload the signed PDF as an attachment and then link it to
 * the Files object's attachment property.
 *
 * @param {string}                  objectPrimaryKey  Primary key of the Files object.
 * @param {Uint8Array|ArrayBuffer}  signedPdfBytes    Signed PDF bytes to upload.
 * @param {string}                  filename
 * @returns {Promise<string>} The new attachment RID.
 */
export async function attachSignedPdfToFileObject(objectPrimaryKey, signedPdfBytes, filename = "signed_document.pdf") {
    const headers = await authHeaders();

    // ── Step 1: Upload PDF → get attachment RID ──────────────────────────────
    // POST /api/v2/ontologies/attachments/upload?filename=...
    const uploadUrl = `${STACK}/api/v2/ontologies/attachments/upload?filename=${encodeURIComponent(filename)}`;

    const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/octet-stream",
        },
        body: new Blob([signedPdfBytes], { type: "application/pdf" }),
    });

    if (!uploadRes.ok) {
        const detail = await uploadRes.text().catch(() => "");
        throw new Error(`Attachment upload failed (HTTP ${uploadRes.status}): ${detail}`);
    }

    const { rid: attachmentRid } = await uploadRes.json();
    // attachmentRid = "ri.attachments.main.attachment.xxxxxxxx-..."

    console.log(`📎 Uploaded signed PDF → attachment RID: ${attachmentRid}`);

    // ── Step 2: Set the attachment RID on the Files object property ───────────
    // PUT (or PATCH) /api/v2/ontologies/{ontology}/objects/{type}/{pk}
    // with body: { properties: { attachment: { rid: "..." } } }
    const objectUrl = `${STACK}/api/v2/ontologies/${encodeURIComponent(ONTOLOGY)}/objects/${encodeURIComponent(OBJECT_TYPE)}/${encodeURIComponent(objectPrimaryKey)}`;

    const patchRes = await fetch(objectUrl, {
        method: "PATCH",
        headers: {
            ...headers,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            properties: {
                [ATTACH_PROP]: { rid: attachmentRid },
            },
        }),
    });

    if (!patchRes.ok) {
        const detail = await patchRes.text().catch(() => "");
        throw new Error(
            `Failed to set ${ATTACH_PROP} on Files[${objectPrimaryKey}] (HTTP ${patchRes.status}): ${detail}`
        );
    }

    console.log(`✅ Files[${objectPrimaryKey}].${ATTACH_PROP} → ${attachmentRid}`);
    return attachmentRid;
}

/**
 * Fetch metadata of an attachment by RID (filename, sizeBytes, mediaType).
 *
 * GET /api/v2/ontologies/attachments/{rid}
 *
 * @param {string} attachmentRid
 * @returns {Promise<{ rid, filename, sizeBytes, mediaType }>}
 */
export async function getAttachment(attachmentRid) {
    const headers = await authHeaders();
    const url = `${STACK}/api/v2/ontologies/attachments/${encodeURIComponent(attachmentRid)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to get attachment (HTTP ${res.status})`);
    return await res.json();
}

/**
 * Fetch a Files object by primary key — useful for debugging / verifying the update.
 * @param {string} primaryKey
 * @returns {Promise<object>}
 */
export async function getFilesObject(primaryKey) {
    const headers = await authHeaders();
    const url = `${STACK}/api/v2/ontologies/${encodeURIComponent(ONTOLOGY)}/objects/${encodeURIComponent(OBJECT_TYPE)}/${encodeURIComponent(primaryKey)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to fetch Files object (HTTP ${res.status})`);
    return await res.json();
}
