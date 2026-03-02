/**
 * Attachment service for Palantir Foundry.
 *
 * This uses the Foundry Platform REST API directly:
 *   GET  /api/v1/attachments/{rid}/content  — download attachment
 *   POST /api/v1/attachments/upload          — upload attachment
 *
 * The client token is retrieved from the @osdk/client platform client.
 * In dev mode, this module is never called.
 */

/**
 * Get a bearer token from the @osdk/client platform client's auth provider.
 * @param {import('@osdk/client').Client} client
 * @returns {Promise<string>}
 */
async function getToken(client) {
    // The @osdk/client exposes the underlying auth provider on internal APIs.
    // We access via the documented path for platform clients.
    const context = client[Symbol.for("osdk.client.context")] ?? client._context ?? client;
    const auth = context.auth ?? context.tokenProvider ?? context;

    if (typeof auth.getToken === "function") return (await auth.getToken()).access_token ?? await auth.getToken();
    if (typeof auth === "function") return await auth();

    throw new Error("Unable to retrieve auth token from OSDK client");
}

/**
 * Download a PDF attachment from Foundry by RID.
 * @param {import('@osdk/client').Client} client
 * @param {string} attachmentRid
 * @returns {Promise<ArrayBuffer>}
 */
export async function downloadPdf(client, attachmentRid) {
    const stack = import.meta.env.VITE_FOUNDRY_STACK ?? "";
    const token = await getToken(client);

    const res = await fetch(
        `${stack}/api/v1/attachments/${encodeURIComponent(attachmentRid)}/content`,
        { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
        throw new Error(`Failed to download attachment: ${res.status} ${res.statusText}`);
    }

    return await res.arrayBuffer();
}

/**
 * Upload a signed PDF (Uint8Array | ArrayBuffer) to Foundry and return the new attachment RID.
 * @param {import('@osdk/client').Client} client
 * @param {Uint8Array | ArrayBuffer} pdfBytes
 * @param {string} filename
 * @returns {Promise<string>} new attachment RID
 */
export async function uploadSignedPdf(client, pdfBytes, filename = "signed_document.pdf") {
    const stack = import.meta.env.VITE_FOUNDRY_STACK ?? "";
    const token = await getToken(client);

    const blob = new Blob([pdfBytes], { type: "application/pdf" });

    const res = await fetch(
        `${stack}/api/v1/attachments/upload?filename=${encodeURIComponent(filename)}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/octet-stream",
            },
            body: blob,
        }
    );

    if (!res.ok) {
        throw new Error(`Failed to upload attachment: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return data.rid;
}
