import React from "react";
import { CheckCircle2, PenLine, Send, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

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
                    <ChevronLeft size={18} />
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
                    <ChevronRight size={18} />
                </button>
            </div>

            <div className="toolbar-section toolbar-center">
                <button className="btn btn-icon" onClick={onZoomOut} disabled={zoom <= 0.5} title="Zoom out">
                    <ZoomOut size={16} />
                </button>
                <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                <button className="btn btn-icon" onClick={onZoomIn} disabled={zoom >= 3} title="Zoom in">
                    <ZoomIn size={16} />
                </button>
            </div>

            <div className="toolbar-section toolbar-right">
                {isSigned ? (
                    <span className="signed-badge" title="This document has already been signed">
                        <CheckCircle2 size={16} /> Doc Already Signed
                    </span>
                ) : (
                    !isPlacing && (
                        <button className="btn btn-secondary" onClick={onAddSignature} title="Open signature pad">
                            <PenLine size={16} /> Sign
                        </button>
                    )
                )}
                {canSubmit && !isSigned && (
                    <button className="btn btn-primary" onClick={onSubmit} title="Submit signed document">
                        <Send size={16} /> Submit
                    </button>
                )}
            </div>
        </div>
    );
}
