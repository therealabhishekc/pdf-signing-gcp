import React from "react";
import { FileText, Loader2, UploadCloud, CheckCircle2, FileXCorner, AlertTriangle, X } from "lucide-react";

/**
 * Fullscreen overlay for loading, success, and error states.
 */
export default function StatusOverlay({ state, error, onRetry, onClose }) {
    if (state === "VIEWING" || state === "SIGNING" || state === "PLACING") {
        return null;
    }

    const stateConfig = {
        WAITING: {
            icon: <FileXCorner size={48} className="status-icon-svg" />,
            title: "No Document To Display",
            description: "No PDF has been assigned to this widget yet.",
            showSpinner: false,
        },
        LOADING: {
            icon: <FileText size={48} className="status-icon-svg text-blue-400" />,
            title: "Loading PDF",
            description: "Fetching document from Foundry…",
            showSpinner: true,
        },
        SUBMITTING: {
            icon: <UploadCloud size={48} className="status-icon-svg text-accent" />,
            title: "Uploading Signed Document",
            description: "Embedding signature and uploading to Foundry…",
            showSpinner: true,
        },
        DONE: {
            icon: <CheckCircle2 size={56} className="status-icon-svg text-green-400" />,
            title: "Document Signed Successfully",
            description: "Your signed document has been attached successfully.",
            showSpinner: false,
            success: true,
        },
        ERROR: {
            icon: <AlertTriangle size={48} className="status-icon-svg text-red-400" />,
            title: "Something Went Wrong",
            description: error || "An unexpected error occurred.",
            showSpinner: false,
            isError: true,
        },
    };

    const config = stateConfig[state];
    if (!config) return null;

    return (
        <div className={`status-overlay ${config.success ? "status-overlay--success" : ""} ${config.isError ? "status-overlay--error" : ""}`}>
            <div className="status-card">
                {config.success && onClose && (
                    <button className="status-close-btn" onClick={onClose} title="Close">
                        ✕
                    </button>
                )}
                <div className="status-icon">{config.icon}</div>
                <h2 className="status-title">{config.title}</h2>
                <p className="status-description">{config.description}</p>
                {config.callToAction && (
                    <p className="status-cta">{config.callToAction}</p>
                )}
                {config.showSpinner && (
                    <div className="spinner">
                        <div className="spinner-ring" />
                    </div>
                )}
                {config.isError && onRetry && (
                    <button className="btn btn-primary" onClick={onRetry}>
                        Try Again
                    </button>
                )}
            </div>
        </div>
    );
}
