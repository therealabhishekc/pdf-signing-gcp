import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Point the worker at the bundled worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

/**
 * PdfViewer — renders a single PDF page onto a canvas using PDF.js.
 * Also renders an overlay canvas on top for signature placement hints.
 *
 * Props:
 *   pdfData: ArrayBuffer  — the raw PDF bytes
 *   currentPage: number
 *   zoom: number
 *   onPageLoaded: (totalPages) => void
 *   pendingSignature: { dataUrl, width, height } | null — signature waiting to be placed
 *   placedSignatures: [{ pageIndex, x, y, width, height, dataUrl }]
 */
export default function PdfViewer({
    pdfData,
    currentPage,
    zoom,
    onPageLoaded,
    placedSignatures = [],
}) {
    const canvasRef = useRef(null);
    const pdfDocRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const renderTaskRef = useRef(null);

    // Load PDF document from ArrayBuffer
    useEffect(() => {
        if (!pdfData) return;

        const loadPdf = async () => {
            try {
                // PDF.js transfers (detaches) the ArrayBuffer to the worker thread.
                // We must pass a COPY via .slice() so the original pdfData stays intact
                // for pdf-lib embedding later.
                const copy = pdfData.slice(0);
                const typedArray = new Uint8Array(copy);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;
                pdfDocRef.current = pdf;
                onPageLoaded?.(pdf.numPages);
            } catch (err) {
                console.error("Failed to load PDF:", err);
            }
        };

        loadPdf();
    }, [pdfData, onPageLoaded]);

    // Render the current page whenever page or zoom changes
    const renderPage = useCallback(async () => {
        const pdf = pdfDocRef.current;
        const canvas = canvasRef.current;
        if (!pdf || !canvas) return;

        // Cancel any ongoing render
        if (renderTaskRef.current) {
            try { renderTaskRef.current.cancel(); } catch { }
        }

        setLoading(true);
        try {
            const page = await pdf.getPage(currentPage);
            const viewport = page.getViewport({ scale: zoom });

            const ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const renderTask = page.render({ canvasContext: ctx, viewport });
            renderTaskRef.current = renderTask;
            await renderTask.promise;

            // Draw placed signatures on top
            for (const sig of placedSignatures) {
                if (sig.pageIndex !== currentPage - 1) continue;
                const img = new Image();
                img.src = sig.dataUrl;
                await new Promise((res) => { img.onload = res; });
                ctx.drawImage(img, sig.x, sig.y, sig.width, sig.height);
            }
        } catch (err) {
            if (err?.name !== "RenderingCancelledException") {
                console.error("PDF render error:", err);
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, zoom, placedSignatures]);

    useEffect(() => {
        renderPage();
    }, [renderPage]);

    return (
        <div className="pdf-viewer">
            {loading && <div className="pdf-loading-badge">Rendering…</div>}
            <canvas ref={canvasRef} className="pdf-canvas" />
        </div>
    );
}
