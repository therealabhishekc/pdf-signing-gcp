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
    onSubmit,
    canSubmit,
    isPlacing,
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
                {!isPlacing && (
                    <button className="btn btn-secondary" onClick={onAddSignature} title="Open signature pad">
                        ✍️ Sign
                    </button>
                )}
                {canSubmit && (
                    <button className="btn btn-primary" onClick={onSubmit} title="Submit signed document">
                        📤 Submit
                    </button>
                )}
            </div>
        </div>
    );
}
