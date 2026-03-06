import React, { useEffect, useRef, useState, useCallback } from "react";
import SignaturePad from "signature_pad";
import { PenTool, Keyboard, Upload, X } from "lucide-react";

const HANDWRITING_FONTS = [
    { name: "Dancing Script", css: "'Dancing Script', cursive" },
    { name: "Great Vibes", css: "'Great Vibes', cursive" },
    { name: "Satisfy", css: "'Satisfy', cursive" },
];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Remove white / near-white background from an image and return a transparent PNG data URL.
 * Useful for JPEG signature photos that have a white paper background.
 */
function removeWhiteBackground(dataUrl, threshold = 240) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
                    data[i + 3] = 0; // make pixel transparent
                }
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL("image/png"));
        };
        img.src = dataUrl;
    });
}

/**
 * SignatureModal — modal with three tabs: Draw, Type, and Upload.
 * Calls onConfirm(dataUrl) when the user confirms.
 */
export default function SignatureModal({ onConfirm, onClose }) {
    const [activeTab, setActiveTab] = useState("draw");
    const [typedName, setTypedName] = useState("");
    const [selectedFont, setSelectedFont] = useState(HANDWRITING_FONTS[0]);
    const [isEmpty, setIsEmpty] = useState(true);

    // Upload state
    const [uploadPreview, setUploadPreview] = useState(null); // processed dataUrl
    const [uploadError, setUploadError] = useState(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const fileInputRef = useRef(null);

    const canvasRef = useRef(null);
    const sigPadRef = useRef(null);

    // Init signature_pad
    useEffect(() => {
        if (activeTab !== "draw" || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext("2d").scale(ratio, ratio);

        const pad = new SignaturePad(canvas, {
            backgroundColor: "rgba(0,0,0,0)",
            penColor: "#1a1a2e",
            minWidth: 1.5,
            maxWidth: 3.5,
        });
        sigPadRef.current = pad;

        const handleChange = () => setIsEmpty(pad.isEmpty());
        pad.addEventListener("endStroke", handleChange);

        return () => {
            pad.off();
            pad.clear();
            sigPadRef.current = null;
        };
    }, [activeTab]);

    const handleClear = () => {
        sigPadRef.current?.clear();
        setIsEmpty(true);
    };

    const handleUndo = () => {
        const pad = sigPadRef.current;
        if (!pad) return;
        const data = pad.toData();
        if (data.length > 0) {
            data.pop();
            pad.fromData(data);
            setIsEmpty(pad.isEmpty());
        }
    };

    /** Convert typed name in selected font to PNG data URL via offscreen canvas */
    const typeToDataUrl = useCallback(() => {
        const offscreen = document.createElement("canvas");
        offscreen.width = 500;
        offscreen.height = 120;
        const ctx = offscreen.getContext("2d");
        ctx.clearRect(0, 0, offscreen.width, offscreen.height);
        ctx.font = `72px ${selectedFont.css}`;
        ctx.fillStyle = "#1a1a2e";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(typedName, 250, 60);
        return offscreen.toDataURL("image/png");
    }, [typedName, selectedFont]);

    // ── Upload handling ──────────────────────────────────────────────────
    const processFile = useCallback(async (file) => {
        setUploadError(null);
        setUploadPreview(null);

        if (!ACCEPTED_TYPES.includes(file.type)) {
            setUploadError("Unsupported format. Use PNG, JPEG, or WebP.");
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setUploadError("File too large. Maximum size is 2 MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            let dataUrl = reader.result;

            // Auto-remove white background for JPEG uploads
            if (file.type === "image/jpeg") {
                dataUrl = await removeWhiteBackground(dataUrl);
            }

            setUploadPreview(dataUrl);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDropFile = (e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };

    const handleDragLeave = () => setIsDraggingOver(false);

    const handleRemoveUpload = () => {
        setUploadPreview(null);
        setUploadError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // ── Confirm ──────────────────────────────────────────────────────────
    const handleDone = () => {
        if (activeTab === "draw") {
            const pad = sigPadRef.current;
            if (!pad || pad.isEmpty()) return;
            onConfirm(pad.toDataURL("image/png"));
        } else if (activeTab === "type") {
            if (!typedName.trim()) return;
            onConfirm(typeToDataUrl());
        } else if (activeTab === "upload") {
            if (!uploadPreview) return;
            onConfirm(uploadPreview);
        }
    };

    const drawTabEmpty = activeTab === "draw" && isEmpty;
    const typeTabEmpty = activeTab === "type" && !typedName.trim();
    const uploadTabEmpty = activeTab === "upload" && !uploadPreview;
    const isDone = !drawTabEmpty && !typeTabEmpty && !uploadTabEmpty;

    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">Add Your Signature</h3>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="tab-bar">
                    <button
                        className={`tab-btn ${activeTab === "draw" ? "tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("draw")}
                    >
                        <PenTool size={16} /> Draw
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "type" ? "tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("type")}
                    >
                        <Keyboard size={16} /> Type
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "upload" ? "tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("upload")}
                    >
                        <Upload size={16} /> Upload
                    </button>
                </div>

                <div className="modal-body">
                    {activeTab === "draw" && (
                        <div className="draw-tab">
                            <p className="draw-hint">Draw your signature below</p>
                            <div className="signature-canvas-wrapper">
                                <canvas ref={canvasRef} className="signature-canvas" />
                            </div>
                            <div className="draw-actions">
                                <button className="btn btn-ghost" onClick={handleUndo}>Undo</button>
                                <button className="btn btn-ghost" onClick={handleClear}>Clear</button>
                            </div>
                        </div>
                    )}

                    {activeTab === "type" && (
                        <div className="type-tab">
                            <input
                                className="type-input"
                                placeholder="Type your full name…"
                                value={typedName}
                                onChange={(e) => setTypedName(e.target.value)}
                                autoFocus
                            />
                            <p className="type-hint">Choose a style:</p>
                            <div className="font-options">
                                {HANDWRITING_FONTS.map((font) => (
                                    <button
                                        key={font.name}
                                        className={`font-option ${selectedFont.name === font.name ? "font-option--selected" : ""}`}
                                        onClick={() => setSelectedFont(font)}
                                        style={{ fontFamily: font.css }}
                                    >
                                        {typedName || "Your Signature"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "upload" && (
                        <div className="upload-tab">
                            {!uploadPreview ? (
                                <div
                                    className={`upload-dropzone ${isDraggingOver ? "upload-dropzone--active" : ""}`}
                                    onDrop={handleDropFile}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload size={32} className="upload-dropzone-icon" />
                                    <p className="upload-dropzone-text">
                                        Drag & drop your signature image here
                                    </p>
                                    <p className="upload-dropzone-hint">
                                        or click to browse · PNG, JPEG, WebP · Max 2 MB
                                    </p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".png,.jpg,.jpeg,.webp"
                                        onChange={handleFileSelect}
                                        hidden
                                    />
                                </div>
                            ) : (
                                <div className="upload-preview">
                                    <img src={uploadPreview} alt="Uploaded signature" className="upload-preview-img" />
                                    <button className="btn btn-ghost" onClick={handleRemoveUpload}>
                                        Remove & re-upload
                                    </button>
                                </div>
                            )}
                            {uploadError && (
                                <p className="upload-error">{uploadError}</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleDone}
                        disabled={!isDone || (activeTab === "draw" && isEmpty)}
                    >
                        Create Signature →
                    </button>
                </div>
            </div>
        </div>
    );
}
