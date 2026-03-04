import React from "react";

/**
 * Top toolbar: page navigation, zoom, and action buttons.
 */
export default function Toolbar({
    currentPage,
    totalPages,
    zoom,
    onPrevPage,
    onNextPage,
    onZoomIn,
    onZoomOut,
    onAddSignature,
    onUndoSignature,
    onSubmit,
    canSubmit,
    isPlacing,
    isSigned,         // boolean from Workshop — hides Sign button if doc already signed
}) {
    return (
        <div className="toolbar">
            <div className="toolbar-section toolbar-left">
                <button
                    className="btn btn-icon"
                    onClick={onPrevPage}
                    disabled={currentPage <= 1}
                    title="Previous page"
                >
                    ‹
                </button>
                <span className="page-indicator">
                    {currentPage} / {totalPages || "—"}
                </span>
                <button
                    className="btn btn-icon"
                    onClick={onNextPage}
                    disabled={currentPage >= totalPages}
                    title="Next page"
                >
                    ›
                </button>
            </div>

            <div className="toolbar-section toolbar-center">
                <button className="btn btn-icon" onClick={onZoomOut} disabled={zoom <= 0.5} title="Zoom out">
                    −
                </button>
                <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="btn btn-icon" onClick={onZoomIn} disabled={zoom >= 3} title="Zoom in">
                    +
                </button>
            </div>

            <div className="toolbar-section toolbar-right">
                {isSigned ? (
                    <span className="signed-badge" title="This document has already been signed">
                        ✅ Doc Already Signed
                    </span>
                ) : (
                    !isPlacing && (
                        <button className="btn btn-secondary" onClick={onAddSignature} title="Open signature pad">
                            ✍️ Sign
                        </button>
                    )
                )}
                {canSubmit && !isSigned && (
                    <>
                        <button className="btn btn-secondary" onClick={onUndoSignature} title="Undo last signature" style={{ marginRight: "8px" }}>
                            ↩️ Undo
                        </button>
                        <button className="btn btn-primary" onClick={onSubmit} title="Submit signed document">
                            📤 Submit
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
