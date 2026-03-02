import React from "react";

/**
 * Fullscreen overlay for loading, success, and error states.
 */
export default function StatusOverlay({ state, error, onRetry }) {
    if (state === "VIEWING" || state === "SIGNING" || state === "PLACING") {
        return null;
    }

    const stateConfig = {
        WAITING: {
            icon: "⏳",
            title: "Waiting for Document",
            description: "Awaiting PDF attachment from Workshop…",
            showSpinner: true,
        },
        LOADING: {
            icon: "📄",
            title: "Loading PDF",
            description: "Fetching document from Foundry…",
            showSpinner: true,
        },
        SUBMITTING: {
            icon: "☁️",
            title: "Uploading Signed Document",
            description: "Embedding signature and uploading to Foundry…",
            showSpinner: true,
        },
        DONE: {
            icon: "✅",
            title: "Document Signed Successfully",
            description: "The signed document has been uploaded to Foundry.",
            showSpinner: false,
            success: true,
        },
        ERROR: {
            icon: "⚠️",
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
                <div className="status-icon">{config.icon}</div>
                <h2 className="status-title">{config.title}</h2>
                <p className="status-description">{config.description}</p>
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
