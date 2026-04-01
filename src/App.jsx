import React, { useState, useCallback, useEffect, useRef } from "react";
import { version } from "../package.json";
import { Check } from "lucide-react";
import PdfViewer from "./components/PdfViewer.jsx";
import SignatureModal from "./components/SignatureModal.jsx";
import SignatureSidebar from "./components/SignatureSidebar.jsx";
import DraggableSignature from "./components/DraggableSignature.jsx";
import StatusOverlay from "./components/StatusOverlay.jsx";
import Toolbar from "./components/Toolbar.jsx";
import ParticipantSidebar from "./components/ParticipantSidebar.jsx";
import { embedSignature } from "./services/pdfSigner.js";

// Apply saved theme on load (before React renders)
(() => {
    const saved = localStorage.getItem("pdf-app-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
})();

// ─── Workshop SDK ───────────────────────────────────────────────────────────
import { useWorkshopContext, visitLoadingState } from "@osdk/workshop-iframe-custom-widget";
import { SIGNING_WIDGET_CONFIG } from "./workshopConfig.js";

// ─── App states ─────────────────────────────────────────────────────────────
//   WAITING → LOADING → VIEWING ↔ SIGNING → SUBMITTING → DONE | ERROR

// ─── Main export ────────────────────────────────────────────────────────────
export default function Root() {
    const urlParams = new URLSearchParams(window.location.search);
    const isParticipant = urlParams.get("participant") === "true";
    const participantPdfId = urlParams.get("pdfId");
    const participantToken = urlParams.get("token");

    if (isParticipant && participantPdfId) {
        return <App participantPdfId={participantPdfId} participantToken={participantToken} isParticipant={true} />;
    }

    return <WorkshopApp />;
}

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
function App({ workshopCtx, participantPdfId, participantToken, isParticipant }) {
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
    const lastLoadedRid = useRef(null);                      // track which key is currently displayed
    const signedPdfRef = useRef(null);                        // holds signed PDF bytes after submit

    const [participantIsSigned, setParticipantIsSigned] = useState(false);
    const [isRevoked, setIsRevoked] = useState(false);

    let activePrimaryKey = null;
    let workshopRole = "Prospect";

    if (isParticipant) {
        activePrimaryKey = participantPdfId;
    } else {
        const pkField = workshopCtx?.filesObjectPrimaryKey?.fieldValue;
        if (pkField?.status === "LOADED" && pkField.value) {
            activePrimaryKey = pkField.value;
        }
        
        const roleField = workshopCtx?.workshopRole?.fieldValue;
        if (roleField?.status === "LOADED" && roleField.value) {
            workshopRole = roleField.value;
        }
    }

    const isSigned = isParticipant
        ? participantIsSigned
        : (workshopCtx?.isSigned?.fieldValue?.status === "LOADED" && workshopCtx?.isSigned?.fieldValue?.value === true);

    // ── React to App context changes ────────────────────────────────────
    useEffect(() => {
        if (!activePrimaryKey) {
            // cleared
            lastLoadedRid.current = null;
            setPdfData(null);
            setPlacedSigs([]);
            setAppState("WAITING");
            return;
        }

        // Skip if this is the same RID we already have loaded
        if (activePrimaryKey === lastLoadedRid.current) return;

        // New Key — reset state and download the new PDF
        lastLoadedRid.current = activePrimaryKey;
        setPdfData(null);
        setPlacedSigs([]);
        setCurrentPage(1);
        setAppState("LOADING");
        (async () => {
            try {
                const { downloadPdf } = await import("./services/attachmentService.js");
                const { buffer, isSigned: downloadedIsSigned } = await downloadPdf(activePrimaryKey, participantToken);
                setPdfData(buffer);
                
                if (isParticipant && downloadedIsSigned) {
                    setParticipantIsSigned(true);
                }
                
                setAppState("VIEWING");
            } catch (err) {
                // Detect hard revocation from the server — show dedicated modal, not generic error
                if (err.message?.toLowerCase().includes("revoked")) {
                    setIsRevoked(true);
                    setAppState("REVOKED");
                } else {
                    setError(err.message);
                    setAppState("ERROR");
                }
            }
        })();
    }, [activePrimaryKey]);

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

    // ── Submit (embed + auto-attach via direct FormData) ────────────
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

            // Get the Files object primary key
            let filesObjectPK = null;
            if (isParticipant) {
                filesObjectPK = participantPdfId;
            } else {
                const pkField = workshopCtx?.filesObjectPrimaryKey?.fieldValue;
                filesObjectPK = pkField?.status === "LOADED" ? pkField.value : null;
            }

            if (!filesObjectPK) {
                throw new Error("Files object primary key is not available.");
            }

            // Direct upload via FormData (no MongoDB buffer)
            const { submitSignedPdf, markParticipantSigned } = await import("./services/attachmentService.js");
            const modifiedBlob = new Blob([modifiedBytes], { type: "application/pdf" });
            await submitSignedPdf(filesObjectPK, modifiedBlob, "signed_document.pdf", participantToken, workshopRole);

            // Store the signed PDF locally so we can show it after closing overlay
            signedPdfRef.current = modifiedBytes;

            // Mark completion in Foundry
            if (isParticipant && participantToken) {
                await markParticipantSigned(participantToken);
                setParticipantIsSigned(true);
            } else if (!isParticipant) {
                workshopCtx.onSignComplete.executeEvent();
                workshopCtx.isSigned.setLoadedValue(true);
            }

            setAppState("DONE");
        } catch (err) {
            setError(err.message);
            setAppState("ERROR");
        }
    }, [pdfData, placedSigs, workshopCtx, isParticipant, participantPdfId, participantToken, workshopRole]);

    const handleRetry = () => {
        setError(null);
        setPlacedSigs([]);
        setPendingSig(null);
        setAppState("WAITING");
    };

    // Close the DONE overlay — swap in the signed PDF so user sees the final result
    const handleDoneClose = () => {
        if (signedPdfRef.current) {
            setPdfData(signedPdfRef.current);
            signedPdfRef.current = null;
        }
        setPlacedSigs([]);
        setAppState("VIEWING");
    };

    const isViewing = appState === "VIEWING" || appState === "SIGNING";

    // ── Download the current PDF (signed or unsigned) ─────────────────────
    const handleDownload = useCallback(() => {
        if (!pdfData) return;
        const blob = new Blob([pdfData], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = isSigned ? "signed_document.pdf" : "document.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [pdfData, isSigned]);

    return (
        <div className="app">
            {/* Revocation modal — shown when participant's access has been explicitly removed */}
            {isRevoked && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 200,
                    background: "rgba(0,0,0,0.7)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backdropFilter: "blur(6px)",
                }}>
                    <div style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "40px 36px",
                        maxWidth: 420,
                        width: "90%",
                        textAlign: "center",
                        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
                    }}>
                        <div style={{
                            width: 56, height: 56,
                            borderRadius: "50%",
                            background: "rgba(239,68,68,0.12)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            margin: "0 auto 20px",
                            fontSize: 26,
                        }}>🚫</div>
                        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                            Access Revoked
                        </h2>
                        <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                            Your access to this document has been revoked by the document owner.
                            Please contact them if you believe this is a mistake.
                        </p>
                    </div>
                </div>
            )}

            {/* Status overlays for non-viewing states */}
            {!isRevoked && <StatusOverlay state={appState} error={error} onRetry={handleRetry} onClose={handleDoneClose} />}

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
                        onDownload={handleDownload}
                        canSubmit={placedSigs.length > 0}
                        isSigned={isSigned}
                        isParticipant={isParticipant}
                    />

                    <div className="app-body">
                        {!isParticipant && (
                            <ParticipantSidebar primaryKey={activePrimaryKey} />
                        )}
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

                        {!isSigned && (
                            <SignatureSidebar
                                signatures={signatureLibrary}
                                onAddSignature={handleAddSignature}
                                onRemoveSignature={handleRemoveFromLibrary}
                                maxSignatures={15}
                                isSigned={isSigned}
                            />
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

            {/* Version badge */}
            <div className="version-badge">v{version}</div>
        </div>
    );
}
