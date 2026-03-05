import React, { useState, useCallback, useEffect, useRef } from "react";
import { version } from "../package.json";
import { Check } from "lucide-react";
import PdfViewer from "./components/PdfViewer.jsx";
import SignatureModal from "./components/SignatureModal.jsx";
import SignatureSidebar from "./components/SignatureSidebar.jsx";
import DraggableSignature from "./components/DraggableSignature.jsx";
import StatusOverlay from "./components/StatusOverlay.jsx";
import Toolbar from "./components/Toolbar.jsx";
import { embedSignature } from "./services/pdfSigner.js";

// ─── Workshop SDK ───────────────────────────────────────────────────────────
import { useWorkshopContext, visitLoadingState } from "@osdk/workshop-iframe-custom-widget";
import { SIGNING_WIDGET_CONFIG } from "./workshopConfig.js";

// ─── App states ─────────────────────────────────────────────────────────────
//   WAITING → LOADING → VIEWING ↔ SIGNING → SUBMITTING → DONE | ERROR

// ─── Main export ────────────────────────────────────────────────────────────
export default function WorkshopApp() {
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
    const [appState, setAppState] = useState("WAITING");
    const [pdfData, setPdfData] = useState(null);           // ArrayBuffer
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [zoom, setZoom] = useState(1.0);
    const [pendingSig, setPendingSig] = useState(null);      // { dataUrl }
    const [signatureLibrary, setSignatureLibrary] = useState([]);  // [{ id, dataUrl }] — sidebar library (max 15)
    const [placedSigs, setPlacedSigs] = useState([]);        // [{ id, pageIndex, x, y, width, height, dataUrl }]
    const [error, setError] = useState(null);
    const pdfViewerRef = useRef(null);
    const lastLoadedRid = useRef(null);                      // track which RID is currently displayed

    // isSigned is only true when Workshop explicitly sends boolean true.
    // null, undefined, false, or unloaded state → false → Sign button shown.
    const isSigned =
        workshopCtx?.isSigned?.fieldValue?.status === "LOADED" &&
        workshopCtx?.isSigned?.fieldValue?.value === true;

    // ── React to Workshop context changes ────────────────────────────────────
    // Re-downloads the PDF whenever pdfAttachmentRid changes (e.g. user selects
    // a different Files object in Workshop → variable updates → new PDF loads).
    useEffect(() => {
        if (!workshopCtx) return;

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
        // Add to the sidebar library (max 15)
        setSignatureLibrary((prev) => {
            if (prev.length >= 15) return prev;
            return [...prev, { id: Date.now().toString(), dataUrl }];
        });
        setAppState("VIEWING");
    };

    const handleRemoveFromLibrary = useCallback((id) => {
        setSignatureLibrary((prev) => prev.filter((s) => s.id !== id));
    }, []);

    /** Called when a sidebar thumbnail is dropped onto the PDF canvas */
    const handleDropOnPdf = useCallback((dataUrl, xPx, yPx) => {
        setPlacedSigs((prev) => [
            ...prev,
            {
                id: Date.now().toString(),
                pageIndex: currentPage - 1,
                x: xPx / zoom,
                y: yPx / zoom,
                width: 200,
                height: 60,
                dataUrl,
            },
        ]);
    }, [currentPage, zoom]);

    const handleUpdateSignature = useCallback((id, newCoords) => {
        setPlacedSigs((prev) => prev.map((sig) =>
            sig.id === id ? { ...sig, ...newCoords } : sig
        ));
    }, []);

    const handleRemoveSignature = useCallback((id) => {
        setPlacedSigs((prev) => prev.filter((sig) => sig.id !== id));
    }, []);

    const handleCopySignature = useCallback((id) => {
        setPlacedSigs((prev) => {
            const source = prev.find((sig) => sig.id === id);
            if (!source) return prev;
            return [
                ...prev,
                { ...source, id: Date.now().toString(), x: source.x + 20, y: source.y + 20 },
            ];
        });
    }, []);

    // ── Submit (embed + upload + auto-attach via Foundry Action) ────────────
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

            // Upload signed PDF → MongoDB → get unique ID
            const { uploadSignedPdf, applyAttachAction } = await import("./services/attachmentService.js");
            const signedPdfId = await uploadSignedPdf(modifiedBytes, "signed_document.pdf");

            // Get the Files object primary key from Workshop context
            const pkField = workshopCtx?.filesObjectPrimaryKey?.fieldValue;
            const filesObjectPK = pkField?.status === "LOADED" ? pkField.value : null;

            if (!filesObjectPK) {
                throw new Error("Files object primary key is not available from Workshop.");
            }

            // Auto-trigger the Foundry Action to attach the PDF
            await applyAttachAction(signedPdfId, filesObjectPK);

            // Also write back to Workshop for state tracking
            workshopCtx.signedPdfId.setLoadedValue(signedPdfId);
            workshopCtx.onSignComplete.executeEvent();

            // Optimistic UI: mark as signed immediately so closing the overlay
            // shows "Doc Already Signed" even before Foundry propagates the change
            workshopCtx.isSigned.setLoadedValue(true);

            setAppState("DONE");
        } catch (err) {
            setError(err.message);
            setAppState("ERROR");
        }
    }, [pdfData, placedSigs, workshopCtx]);

    const handleRetry = () => {
        setError(null);
        setPlacedSigs([]);
        setPendingSig(null);
        setAppState("WAITING");
    };

    // Close the DONE overlay and go back to VIEWING
    const handleDoneClose = () => {
        setPlacedSigs([]);
        setAppState("VIEWING");
    };

    const isViewing = appState === "VIEWING" || appState === "SIGNING";

    return (
        <div className="app">
            {/* Status overlays for non-viewing states */}
            <StatusOverlay state={appState} error={error} onRetry={handleRetry} onClose={handleDoneClose} />

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
                        onSubmit={handleSubmit}
                        canSubmit={placedSigs.length > 0}
                        isSigned={isSigned}
                    />

                    <div className="app-body">
                        <div className="pdf-workspace" ref={pdfViewerRef}>
                            <PdfViewer
                                pdfData={pdfData}
                                currentPage={currentPage}
                                zoom={zoom}
                                onPageLoaded={setTotalPages}
                                onDropSignature={handleDropOnPdf}
                                overlayContent={
                                    <>
                                        {placedSigs
                                            .filter((sig) => sig.pageIndex === currentPage - 1)
                                            .map((sig) => (
                                                <DraggableSignature
                                                    key={sig.id}
                                                    id={sig.id}
                                                    dataUrl={sig.dataUrl}
                                                    initialX={sig.x}
                                                    initialY={sig.y}
                                                    initialWidth={sig.width}
                                                    initialHeight={sig.height}
                                                    zoom={zoom}
                                                    onUpdate={handleUpdateSignature}
                                                    onRemove={handleRemoveSignature}
                                                    onCopy={handleCopySignature}
                                                />
                                            ))}
                                    </>
                                }
                            />

                            {/* Floating signature counter badge */}
                            {placedSigs.length > 0 && (
                                <div className="sig-count-badge">
                                    <Check size={14} /> {placedSigs.length} signature{placedSigs.length > 1 ? "s" : ""}
                                </div>
                            )}
                        </div>

                        <SignatureSidebar
                            signatures={signatureLibrary}
                            onAddSignature={handleAddSignature}
                            onRemoveSignature={handleRemoveFromLibrary}
                            maxSignatures={15}
                            isSigned={isSigned}
                        />
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

            {/* Version badge */}
            <div className="version-badge">v{version}</div>
        </div>
    );
}
