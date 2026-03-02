import React, { useEffect, useRef, useState, useCallback } from "react";
import SignaturePad from "signature_pad";

const HANDWRITING_FONTS = [
    { name: "Dancing Script", css: "'Dancing Script', cursive" },
    { name: "Great Vibes", css: "'Great Vibes', cursive" },
    { name: "Satisfy", css: "'Satisfy', cursive" },
];

/**
 * SignatureModal — modal with two tabs: Draw and Type.
 * Calls onConfirm(dataUrl) when the user confirms.
 */
export default function SignatureModal({ onConfirm, onClose }) {
    const [activeTab, setActiveTab] = useState("draw");
    const [typedName, setTypedName] = useState("");
    const [selectedFont, setSelectedFont] = useState(HANDWRITING_FONTS[0]);
    const [isEmpty, setIsEmpty] = useState(true);

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

    const handleDone = () => {
        if (activeTab === "draw") {
            const pad = sigPadRef.current;
            if (!pad || pad.isEmpty()) return;
            onConfirm(pad.toDataURL("image/png"));
        } else {
            if (!typedName.trim()) return;
            onConfirm(typeToDataUrl());
        }
    };

    const drawTabEmpty = activeTab === "draw" && isEmpty;
    const typeTabEmpty = activeTab === "type" && !typedName.trim();
    const isDone = !drawTabEmpty && !typeTabEmpty;

    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <div className="modal-header">
                    <h3 className="modal-title">Add Your Signature</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="tab-bar">
                    <button
                        className={`tab-btn ${activeTab === "draw" ? "tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("draw")}
                    >
                        ✍️ Draw
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "type" ? "tab-btn--active" : ""}`}
                        onClick={() => setActiveTab("type")}
                    >
                        ⌨️ Type
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
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleDone}
                        disabled={!isDone || (activeTab === "draw" && isEmpty)}
                    >
                        Place Signature →
                    </button>
                </div>
            </div>
        </div>
    );
}
