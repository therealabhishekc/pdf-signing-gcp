import React, { useState, useCallback, useEffect, useRef } from "react";
import PdfViewer from "./components/PdfViewer.jsx";
import SignatureModal from "./components/SignatureModal.jsx";
import SignaturePlacer from "./components/SignaturePlacer.jsx";
import StatusOverlay from "./components/StatusOverlay.jsx";
import Toolbar from "./components/Toolbar.jsx";
import { embedSignature } from "./services/pdfSigner.js";

// ─── Dev Mode ───────────────────────────────────────────────────────────────
const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

// ─── Workshop SDK ───────────────────────────────────────────────────────────
// These are only used in production (WorkshopApp). Vite tree-shakes them in dev.
import { useWorkshopContext, visitLoadingState } from "@osdk/workshop-iframe-custom-widget";
import { SIGNING_WIDGET_CONFIG } from "./workshopConfig.js";

// ─── App states ─────────────────────────────────────────────────────────────
//   WAITING → LOADING → VIEWING ↔ SIGNING ↔ PLACING → SUBMITTING → DONE | ERROR

// ─── Main export ────────────────────────────────────────────────────────────
// In dev mode, render App directly.
// In production, WorkshopApp wraps App with useWorkshopContext.
export default DEV_MODE ? App : WorkshopApp;

// ─── Workshop wrapper (production only) ─────────────────────────────────────
function WorkshopApp() {
    const workshopContext = useWorkshopContext(SIGNING_WIDGET_CONFIG);

    return visitLoadingState(workshopContext, {
        loading: () => (
            <div className="app">
                <StatusOverlay state="WAITING" error={null} onRetry={() => { }} />
            </div>
        ),
        succeeded: (ctx) => <App workshopCtx={ctx} />,
        reloading: (ctx) => <App workshopCtx={ctx} />,
        failed: (errMsg) => (
            <div className="app">
                <StatusOverlay state="ERROR" error={`Workshop connection failed: ${errMsg}`} onRetry={() => window.location.reload()} />
            </div>
        ),
    });
}

// ─── Core App component ─────────────────────────────────────────────────────
function App({ workshopCtx }) {
    const [appState, setAppState] = useState(DEV_MODE ? "LOADING" : "WAITING");
    const [pdfData, setPdfData] = useState(null);           // ArrayBuffer
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1.0);
    const [pendingSig, setPendingSig] = useState(null);      // { dataUrl }
    const [placedSigs, setPlacedSigs] = useState([]);        // [{ pageIndex, x, y, w, h, dataUrl }]
    const [error, setError] = useState(null);
    const pdfViewerRef = useRef(null);
    const lastLoadedRid = useRef(null);                      // track which RID is currently displayed

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

    // ── Production: react to Workshop context changes ────────────────────────
    // Re-downloads the PDF whenever pdfAttachmentRid changes (e.g. user selects
    // a different Files object in Workshop → variable updates → new PDF loads).
    useEffect(() => {
        if (DEV_MODE || !workshopCtx) return;

        const ridField = workshopCtx.pdfAttachmentRid?.fieldValue;
        // The field value is wrapped in an async state: { status, value }
        if (!ridField || ridField.status !== "LOADED" || !ridField.value) {
            // RID cleared — go back to empty state
            if (ridField?.status === "LOADED" && !ridField.value) {
                lastLoadedRid.current = null;
                setPdfData(null);
                setPlacedSigs([]);
                setAppState("WAITING");
            }
            return;
        }

        const attachmentRid = ridField.value;

        // Skip if this is the same RID we already have loaded
        if (attachmentRid === lastLoadedRid.current) return;

        // New RID — reset state and download the new PDF
        lastLoadedRid.current = attachmentRid;
        setPdfData(null);
        setPlacedSigs([]);
        setCurrentPage(1);
        setAppState("LOADING");
        (async () => {
            try {
                const { downloadPdf } = await import("./services/attachmentService.js");
                const buffer = await downloadPdf(attachmentRid);
                setPdfData(buffer);
                setAppState("VIEWING");
            } catch (err) {
                setError(err.message);
                setAppState("ERROR");
            }
        })();
    }, [workshopCtx?.pdfAttachmentRid?.fieldValue]);

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
                // ── Production flow (via Workshop SDK) ────────────────────
                // 1. Upload signed PDF → get attachment RID
                const { uploadSignedPdf } = await import("./services/attachmentService.js");
                const signedRid = await uploadSignedPdf(modifiedBytes, "signed_document.pdf");

                // 2. Write the signed RID back to Workshop via the SDK
                workshopCtx.signedAttachmentRid.setLoadedValue(signedRid);

                // 3. Fire the onSignComplete event → Workshop triggers bound Action
                workshopCtx.onSignComplete.executeEvent();

                setAppState("DONE");
            }
        } catch (err) {
            setError(err.message);
            setAppState("ERROR");
        }
    }, [pdfData, placedSigs, workshopCtx]); // filesPrimaryKey removed — no longer needed

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
