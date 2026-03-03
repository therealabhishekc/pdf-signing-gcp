import React, { useState, useCallback, useEffect, useRef } from "react";
import PdfViewer from "./components/PdfViewer.jsx";
import SignatureModal from "./components/SignatureModal.jsx";
import SignaturePlacer from "./components/SignaturePlacer.jsx";
import StatusOverlay from "./components/StatusOverlay.jsx";
import Toolbar from "./components/Toolbar.jsx";
import { embedSignature } from "./services/pdfSigner.js";

// ─── Dev Mode ───────────────────────────────────────────────────────────────
const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

// ─── App states ─────────────────────────────────────────────────────────────
//   WAITING → LOADING → VIEWING ↔ SIGNING ↔ PLACING → SUBMITTING → DONE | ERROR

export default function App() {
    const [appState, setAppState] = useState(DEV_MODE ? "LOADING" : "WAITING");
    const [pdfData, setPdfData] = useState(null);           // ArrayBuffer
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1.0);
    const [pendingSig, setPendingSig] = useState(null);      // { dataUrl }
    const [placedSigs, setPlacedSigs] = useState([]);        // [{ pageIndex, x, y, w, h, dataUrl }]
    const [error, setError] = useState(null);
    const [filesPrimaryKey, setFilesPrimaryKey] = useState(null); // which Files object to update
    const pdfViewerRef = useRef(null);

    // ── Dev mode: load sample PDF ────────────────────────────────────────────
    useEffect(() => {
        if (!DEV_MODE) return;
        (async () => {
            try {
                const res = await fetch("/sample.pdf");
                if (!res.ok) throw new Error("Could not load /sample.pdf");
                const buffer = await res.arrayBuffer();
                setPdfData(buffer);
                setAppState("VIEWING");
            } catch (err) {
                setError(err.message);
                setAppState("ERROR");
            }
        })();
    }, []);

    // ── Production: listen for postMessage from Workshop ────────────────────
    useEffect(() => {
        if (DEV_MODE) return;
        const handler = async (event) => {
            // Workshop sends: { pdfAttachmentRid, fileObjectPrimaryKey }
            const { pdfAttachmentRid, fileObjectPrimaryKey: fk } = event.data ?? {};
            if (!pdfAttachmentRid) return;
            setAppState("LOADING");
            try {
                const { downloadPdf } = await import("./services/attachmentService.js");
                const buffer = await downloadPdf(pdfAttachmentRid);
                setPdfData(buffer);
                setFilesPrimaryKey(fk ?? null);  // remember which Files object this PDF belongs to
                setAppState("VIEWING");
            } catch (err) {
                setError(err.message);
                setAppState("ERROR");
            }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, []);

    // ── Toolbar controls ─────────────────────────────────────────────────────
    const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
    const handleNextPage = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
    const handleZoomIn = () => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)));
    const handleZoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));

    // ── Signature flow ───────────────────────────────────────────────────────
    const handleAddSignature = () => setAppState("SIGNING");

    const handleSignatureConfirm = (dataUrl) => {
        setPendingSig({ dataUrl });
        setAppState("PLACING");
    };

    const handleSignaturePlaced = useCallback(({ x, y, width, height }) => {
        // Divide by zoom to convert canvas pixels → PDF points
        setPlacedSigs((prev) => [
            ...prev,
            {
                pageIndex: currentPage - 1,
                x: x / zoom,
                y: y / zoom,
                width: width / zoom,
                height: height / zoom,
                dataUrl: pendingSig.dataUrl,
            },
        ]);
        setPendingSig(null);
        setAppState("VIEWING");
    }, [currentPage, pendingSig, zoom]);

    const handleCancelPlace = () => {
        setPendingSig(null);
        setAppState("VIEWING");
    };

    // ── Submit (embed + download / upload) ─────────────────────────────────
    const handleSubmit = useCallback(async () => {
        if (!pdfData || placedSigs.length === 0) return;
        setAppState("SUBMITTING");
        try {
            let modifiedBytes = pdfData;
            for (const sig of placedSigs) {
                modifiedBytes = await embedSignature(
                    modifiedBytes,
                    sig.dataUrl,
                    { pageIndex: sig.pageIndex, x: sig.x, y: sig.y, width: sig.width, height: sig.height }
                );
            }

            if (DEV_MODE) {
                // ── Dev mode: download locally ────────────────────────────
                const blob = new Blob([modifiedBytes], { type: "application/pdf" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "signed_document.pdf";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 5000);
                setAppState("DONE");
            } else {
                // ── Production flow ───────────────────────────────────────
                // 1. Upload signed PDF → get attachment RID
                const { uploadSignedPdf } = await import("./services/attachmentService.js");
                const signedRid = await uploadSignedPdf(modifiedBytes, "signed_document.pdf");

                // 2. Notify Workshop with the signed RID + original object key
                //    Workshop's Action handler updates Files.attachment via the ontology
                window.parent.postMessage({
                    signedAttachmentRid: signedRid,
                    fileObjectPrimaryKey: filesPrimaryKey ?? null,
                }, "*");
                setAppState("DONE");
            }
        } catch (err) {
            setError(err.message);
            setAppState("ERROR");
        }
    }, [pdfData, placedSigs, filesPrimaryKey]);

    const handleRetry = () => {
        setError(null);
        setPlacedSigs([]);
        setPendingSig(null);
        setAppState(DEV_MODE ? "LOADING" : "WAITING");
    };

    const isViewing = appState === "VIEWING" || appState === "SIGNING" || appState === "PLACING";

    return (
        <div className="app">
            {/* Status overlays for non-viewing states */}
            <StatusOverlay state={appState} error={error} onRetry={handleRetry} />

            {/* Main PDF workspace */}
            {isViewing && (
                <>
                    <Toolbar
                        currentPage={currentPage}
                        totalPages={totalPages}
                        zoom={zoom}
                        onPrevPage={handlePrevPage}
                        onNextPage={handleNextPage}
                        onZoomIn={handleZoomIn}
                        onZoomOut={handleZoomOut}
                        onAddSignature={handleAddSignature}
                        onSubmit={handleSubmit}
                        canSubmit={placedSigs.length > 0}
                        isPlacing={appState === "PLACING"}
                    />

                    <div className="pdf-workspace" ref={pdfViewerRef}>
                        <PdfViewer
                            pdfData={pdfData}
                            currentPage={currentPage}
                            zoom={zoom}
                            onPageLoaded={setTotalPages}
                            placedSignatures={placedSigs}
                            overlayContent={
                                appState === "PLACING" && pendingSig ? (
                                    <SignaturePlacer
                                        signatureDataUrl={pendingSig.dataUrl}
                                        zoom={zoom}
                                        onPlace={handleSignaturePlaced}
                                        onCancel={handleCancelPlace}
                                    />
                                ) : null
                            }
                        />

                        {/* Floating signature counter badge */}
                        {placedSigs.length > 0 && (
                            <div className="sig-count-badge">
                                {placedSigs.length} signature{placedSigs.length > 1 ? "s" : ""}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Signature modal */}
            {appState === "SIGNING" && (
                <SignatureModal
                    onConfirm={handleSignatureConfirm}
                    onClose={() => setAppState("VIEWING")}
                />
            )}
        </div>
    );
}
