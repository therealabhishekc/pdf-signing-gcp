// PDF signature embedding using pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Embeds a PNG signature image into a PDF at the specified position.
 *
 * @param {ArrayBuffer} pdfBytes - The original PDF bytes.
 * @param {string} signaturePngBase64 - data:image/png;base64,... string.
 * @param {{ pageIndex: number, x: number, y: number, width: number, height: number }} position
 * @param {string} timestamp - Optional timestamp string to draw below the signature.
 * @returns {Promise<Uint8Array>} Modified PDF bytes.
 */
export async function embedSignature(pdfBytes, signaturePngBase64, position, timestamp) {
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

    if (timestamp) {
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 10;
        const textWidth = helveticaFont.widthOfTextAtSize(timestamp, fontSize);
        
        // Center text horizontally under the signature image
        const textX = position.x + (position.width / 2) - (textWidth / 2);
        const textY = pdfY - fontSize - 2; // slightly below the image

        page.drawText(timestamp, {
            x: textX,
            y: textY,
            size: fontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
        });
    }

    return await pdfDoc.save();
}
