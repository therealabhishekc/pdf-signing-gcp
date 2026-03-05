import React from "react";
import { Plus, X, GripVertical } from "lucide-react";

/**
 * SignatureSidebar — permanent right panel showing a library of created signatures.
 * Users can drag thumbnails from here onto the PDF to place them.
 *
 * Props:
 *   signatures:        [{ id, dataUrl }]
 *   onAddSignature:    () => void — opens the signature modal
 *   onRemoveSignature: (id) => void — removes from library
 *   maxSignatures:     number (default 15)
 *   isSigned:          boolean — hides Add button when doc is already signed
 */
export default function SignatureSidebar({
    signatures,
    onAddSignature,
    onRemoveSignature,
    maxSignatures = 15,
    isSigned = false,
}) {
    const atLimit = signatures.length >= maxSignatures;

    const handleDragStart = (e, dataUrl) => {
        e.dataTransfer.setData("application/x-signature-dataurl", dataUrl);
        e.dataTransfer.effectAllowed = "copy";
    };

    return (
        <aside className="signature-sidebar">
            <div className="sidebar-header">
                <h4 className="sidebar-title">Signatures</h4>
                <span className="sidebar-count">{signatures.length}/{maxSignatures}</span>
            </div>

            {!isSigned && (
                <button
                    className="btn btn-primary sidebar-add-btn"
                    onClick={onAddSignature}
                    disabled={atLimit}
                    title={atLimit ? "Maximum signatures reached" : "Add a new signature"}
                >
                    <Plus size={16} /> Add Signature
                </button>
            )}

            <div className="sidebar-list">
                {signatures.length === 0 && (
                    <p className="sidebar-empty">
                        No signatures yet.<br />Click "Add Signature" to create one, then drag it onto the PDF.
                    </p>
                )}

                {signatures.map((sig) => (
                    <div
                        key={sig.id}
                        className="sidebar-sig-thumb"
                        draggable
                        onDragStart={(e) => handleDragStart(e, sig.dataUrl)}
                        title="Drag onto the PDF to place"
                    >
                        <div className="thumb-drag-hint">
                            <GripVertical size={14} />
                        </div>
                        <img
                            src={sig.dataUrl}
                            alt="Signature"
                            draggable={false}
                            className="thumb-img"
                        />
                        <button
                            className="thumb-remove-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveSignature(sig.id);
                            }}
                            title="Remove from library"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
}
