import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Point the worker at the bundled worker file
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString();

/**
 * PdfViewer — renders a single PDF page onto a canvas using PDF.js.
 * Also renders an overlay container on top for interactive DOM signatures.
 * Accepts drops from the SignatureSidebar to place new signatures.
 *
 * Props:
 *   pdfData: ArrayBuffer  — the raw PDF bytes
 *   currentPage: number
 *   zoom: number
 *   onPageLoaded: (totalPages) => void
 *   onDropSignature: (dataUrl, xPx, yPx) => void — called when a sidebar sig is dropped
 *   overlayContent: ReactNode | null — rendered inside .pdf-viewer, same coordinate space as canvas
 */
export default function PdfViewer({
    pdfData,
    currentPage,
    zoom,
    onPageLoaded,
    onDropSignature,
    overlayContent = null,
}) {
    const canvasRef = useRef(null);
    const pdfDocRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [pdfReady, setPdfReady] = useState(false);
    const renderTaskRef = useRef(null);

    // Load PDF document from ArrayBuffer
    useEffect(() => {
        if (!pdfData) return;

        const loadPdf = async () => {
            try {
                const copy = pdfData.slice(0);
                const typedArray = new Uint8Array(copy);
                const loadingTask = pdfjsLib.getDocument({ data: typedArray });
                const pdf = await loadingTask.promise;
                pdfDocRef.current = pdf;
                setPdfReady(true);
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
        } catch (err) {
            if (err?.name !== "RenderingCancelledException") {
                console.error("PDF render error:", err);
            }
        } finally {
            setLoading(false);
        }
    }, [currentPage, zoom, pdfReady]);

    useEffect(() => {
        renderPage();
    }, [renderPage]);

    // ── Drop handling for sidebar signatures ──────────────────────────────
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        const dataUrl = e.dataTransfer.getData("application/x-signature-dataurl");
        if (!dataUrl || !onDropSignature || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const xPx = e.clientX - rect.left;
        const yPx = e.clientY - rect.top;
        onDropSignature(dataUrl, xPx, yPx);
    }, [onDropSignature]);

    return (
        <div
            className="pdf-viewer"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {loading && <div className="pdf-loading-badge">Rendering…</div>}
            <canvas ref={canvasRef} className="pdf-canvas" />
            {overlayContent}
        </div>
    );
}
