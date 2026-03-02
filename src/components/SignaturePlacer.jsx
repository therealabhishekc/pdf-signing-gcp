import React, { useRef, useState, useCallback } from "react";

/**
 * SignaturePlacer — renders on top of the PDF canvas.
 * Lets the user click-and-drag to position + resize the signature ghost image.
 * Calls onPlace({ x, y, width, height }) when done.
 */
export default function SignaturePlacer({ signatureDataUrl, canvasRect, onPlace, onCancel }) {
    const containerRef = useRef(null);
    const [pos, setPos] = useState({ x: 60, y: 60, width: 200, height: 60 });
    const [dragging, setDragging] = useState(false);
    const dragStart = useRef(null);

    const startDrag = useCallback((e) => {
        e.preventDefault();
        setDragging(true);
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragStart.current = { clientX, clientY, startX: pos.x, startY: pos.y };

        const onMove = (moveEvent) => {
            const cx = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const cy = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
            const dx = cx - dragStart.current.clientX;
            const dy = cy - dragStart.current.clientY;
            setPos((prev) => ({
                ...prev,
                x: Math.max(0, dragStart.current.startX + dx),
                y: Math.max(0, dragStart.current.startY + dy),
            }));
        };
        const onEnd = () => {
            setDragging(false);
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onEnd);
    }, [pos.x, pos.y]);

    const handleConfirm = () => {
        onPlace(pos);
    };

    return (
        <div className="signature-placer-overlay" ref={containerRef}>
            {/* Instructional banner */}
            <div className="placer-banner">
                <span>Drag the signature to position it, then click <strong>Place</strong></span>
                <div className="placer-banner-actions">
                    <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={handleConfirm}>Place ✓</button>
                </div>
            </div>

            {/* Draggable ghost signature */}
            <div
                className={`sig-ghost ${dragging ? "sig-ghost--dragging" : ""}`}
                style={{
                    left: pos.x,
                    top: pos.y,
                    width: pos.width,
                    height: pos.height,
                }}
                onMouseDown={startDrag}
                onTouchStart={startDrag}
            >
                <img
                    src={signatureDataUrl}
                    draggable={false}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    alt="Signature preview"
                />
                {/* Resize handle (bottom-right corner) */}
                <div
                    className="resize-handle"
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        const startW = pos.width;
                        const startH = pos.height;
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const onMove = (me) => {
                            const dw = me.clientX - startX;
                            const dh = me.clientY - startY;
                            setPos((p) => ({
                                ...p,
                                width: Math.max(80, startW + dw),
                                height: Math.max(30, startH + dh),
                            }));
                        };
                        const onEnd = () => {
                            window.removeEventListener("mousemove", onMove);
                            window.removeEventListener("mouseup", onEnd);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onEnd);
                    }}
                />
            </div>
        </div>
    );
}
