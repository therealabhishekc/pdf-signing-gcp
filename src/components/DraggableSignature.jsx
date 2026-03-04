import React, { useState, useRef, useCallback } from "react";

/**
 * An interactive, absolutely positioned signature on the PDF canvas.
 * Handles dragging, resizing, and showing a hover toolbar.
 */
export default function DraggableSignature({
    id,
    dataUrl,
    initialX,
    initialY,
    initialWidth,
    initialHeight,
    zoom,
    onUpdate, // (id, { x, y, width, height }) => void (coords in PDF points)
    onRemove, // (id) => void
    onCopy,   // (id) => void
}) {
    // Local pixel coordinates for snappy drag/resize response
    const [pos, setPos] = useState({
        x: initialX * zoom,
        y: initialY * zoom,
        width: initialWidth * zoom,
        height: initialHeight * zoom,
    });
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // Sync external changes (like zoom) to local pixel state,
    // ONLY when we aren't actively engaging with the component.
    React.useEffect(() => {
        if (!isDragging) {
            setPos({
                x: initialX * zoom,
                y: initialY * zoom,
                width: initialWidth * zoom,
                height: initialHeight * zoom,
            });
        }
    }, [initialX, initialY, initialWidth, initialHeight, zoom, isDragging]);

    const dragStart = useRef(null);

    // --- Dragging the entire signature ---
    const startDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
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
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);

            // Commit final position to parent in PDF points
            setPos((finalPos) => {
                onUpdate(id, {
                    x: finalPos.x / zoom,
                    y: finalPos.y / zoom,
                    width: finalPos.width / zoom,
                    height: finalPos.height / zoom
                });
                setIsDragging(false);
                return finalPos;
            });
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onEnd);
    }, [pos.x, pos.y, id, zoom, onUpdate]);

    // --- Resizing via corner handle ---
    const startResize = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        const startW = pos.width;
        const startH = pos.height;
        const ratio = startH / startW;
        const startX = e.touches ? e.touches[0].clientX : e.clientX;

        const onMove = (me) => {
            const cx = me.touches ? me.touches[0].clientX : me.clientX;
            const dw = cx - startX;
            const newW = Math.max(80 * zoom, startW + dw);
            setPos((p) => ({
                ...p,
                width: newW,
                height: newW * ratio,
            }));
        };

        const onEnd = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);

            // Commit final size to parent in PDF points
            setPos((finalPos) => {
                onUpdate(id, {
                    x: finalPos.x / zoom,
                    y: finalPos.y / zoom,
                    width: finalPos.width / zoom,
                    height: finalPos.height / zoom
                });
                setIsDragging(false);
                return finalPos;
            });
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onEnd);
    }, [pos.width, pos.height, id, zoom, onUpdate]);

    return (
        <div
            className={`draggable-sig ${isHovered || isDragging ? "draggable-sig--active" : ""}`}
            style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                width: pos.width,
                height: pos.height,
                cursor: "move",
                zIndex: isDragging ? 100 : 10,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseDown={startDrag}
            onTouchStart={startDrag}
        >
            {/* The signature itself */}
            <img
                src={dataUrl}
                alt="Placed signature"
                draggable={false}
                style={{ width: "100%", height: "100%", display: "block" }}
            />

            {/* Hover UI: Copy / Remove Toolbar */}
            {(isHovered || isDragging) && (
                <div
                    className="draggable-sig-toolbar"
                    onMouseDown={(e) => e.stopPropagation()} // Prevent dragging when clicking buttons
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <button className="sig-action-btn" onClick={() => onCopy(id)} title="Copy">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy
                    </button>
                    <button className="sig-action-btn sig-action-btn--danger" onClick={() => onRemove(id)} title="Remove">
                        ✕
                    </button>
                </div>
            )}

            {/* Hover UI: Resize handle */}
            {(isHovered || isDragging) && (
                <div
                    className="sig-resize-handle"
                    onMouseDown={startResize}
                    onTouchStart={startResize}
                />
            )}
        </div>
    );
}
