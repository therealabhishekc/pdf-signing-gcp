// PDF signature embedding using pdf-lib.
import { PDFDocument } from "pdf-lib";

/**
 * Embeds a PNG signature image into a PDF at the specified position.
 *
 * @param {ArrayBuffer} pdfBytes - The original PDF bytes.
 * @param {string} signaturePngBase64 - data:image/png;base64,... string.
 * @param {{ pageIndex: number, x: number, y: number, width: number, height: number }} position
 * @returns {Promise<Uint8Array>} Modified PDF bytes.
 */
export async function embedSignature(pdfBytes, signaturePngBase64, position) {
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Strip the data URL prefix if present
    const base64Data = signaturePngBase64.replace(/^data:image\/png;base64,/, "");
    const pngBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const signatureImage = await pdfDoc.embedPng(pngBytes);

    const pages = pdfDoc.getPages();
    const page = pages[position.pageIndex] ?? pages[0];
    const { height: pageHeight } = page.getSize();

    // PDF coordinate origin is bottom-left; convert from top-left canvas coords
    const pdfY = pageHeight - position.y - position.height;

    page.drawImage(signatureImage, {
        x: position.x,
        y: pdfY,
        width: position.width,
        height: position.height,
    });

    return await pdfDoc.save();
}
