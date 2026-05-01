import React, { useState, useRef, useEffect } from "react";
import { Lock, Send, Download, MoreVertical, Sun, Moon, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, UserPlus, RefreshCw } from "lucide-react";

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
    onDownload,
    canSubmit,
    isSigned,
    isParticipant,
    onAddParticipant,
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    // Read initial theme from document
    const [theme, setTheme] = useState(() => {
        return document.documentElement.getAttribute("data-theme") || "dark";
    });

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [menuOpen]);

    const switchTheme = (newTheme) => {
        setTheme(newTheme);
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("pdf-app-theme", newTheme);
        setMenuOpen(false);
    };

    return (
        <div className="toolbar">
            <div className="toolbar-section toolbar-left">
                <button
                    className="btn btn-icon"
                    onClick={() => window.location.reload()}
                    title="Refresh page"
                >
                    <RefreshCw size={16} />
                </button>
                <div style={{ width: 8 }} /> {/* Spacing */}
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
                <button className="btn btn-icon" onClick={onDownload} title="Download PDF">
                    <Download size={16} />
                </button>

                {/* Three-dot menu */}
                <div className="toolbar-menu-wrapper" ref={menuRef}>
                    <button
                        className="btn btn-icon"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        title="More options"
                    >
                        <MoreVertical size={16} />
                    </button>

                    {menuOpen && (
                        <div className="toolbar-dropdown">
                            <button
                                className={`toolbar-dropdown-item ${theme === "light" ? "toolbar-dropdown-item--active" : ""}`}
                                onClick={() => switchTheme("light")}
                            >
                                <Sun size={14} /> Light Mode
                            </button>
                            <button
                                className={`toolbar-dropdown-item ${theme === "dark" ? "toolbar-dropdown-item--active" : ""}`}
                                onClick={() => switchTheme("dark")}
                            >
                                <Moon size={14} /> Dark Mode
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
