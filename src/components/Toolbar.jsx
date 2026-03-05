import React from "react";
import { Lock, Send, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

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
    onSubmit,
    canSubmit,
    isSigned,         // boolean from Workshop — shows badge if doc already signed
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
                {isSigned && (
                    <span className="signed-badge" title="This document has been signed">
                        <Lock size={14} /> Document Signed
                    </span>
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
