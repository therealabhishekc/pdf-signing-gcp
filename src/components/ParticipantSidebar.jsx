import React, { useState, useEffect } from "react";
import { Users, Mail, Trash2, CheckCircle2, Loader2, PanelLeftClose } from "lucide-react";
import { addParticipant, getParticipants, deleteParticipant } from "../services/attachmentService.js";

export default function ParticipantSidebar({ primaryKey, isOpen, onToggle }) {
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [isEmailValid, setIsEmailValid] = useState(false);

    const [participants, setParticipants] = useState([]);
    const [loadingParticipants, setLoadingParticipants] = useState(true);
    const [deletingId, setDeletingId] = useState(null);

    const fetchParticipants = async () => {
        setLoadingParticipants(true);
        try {
            const data = await getParticipants(primaryKey);
            setParticipants(data.participants || []);
        } catch (err) {
            console.error("Failed to load participants", err);
        } finally {
            setLoadingParticipants(false);
        }
    };

    useEffect(() => {
        if (primaryKey) fetchParticipants();
    }, [primaryKey]);


    const handleAdd = async (e) => {
        e.preventDefault();
        if (!isEmailValid || sending) return;

        setSending(true);
        setError(null);
        try {
            await addParticipant(email, primaryKey);
            setEmail("");
            setIsEmailValid(false);
            fetchParticipants(); // Refresh list automatically
        } catch (err) {
            setError(err.message || "Failed to add participant");
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (participantId) => {
        setDeletingId(participantId);
        try {
            await deleteParticipant(participantId);
            fetchParticipants();
        } catch (err) {
            console.error("Failed to delete participant", err);
            setError(err.message || "Failed to remove participant.");
        } finally {
            setDeletingId(null);
        }
    };

    /**
     * Formats a Palantir timestamp using the viewer's local timezone.
     * e.g. "03 Mar 2026 03:14 PM IST" in India, "03 Mar 2026 09:44 AM EST" in New York
     */
    const formatSignatureDate = (ts) => {
        if (!ts) return null;
        try {
            const date = new Date(ts);
            if (isNaN(date.getTime())) return null;

            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();

            let h = date.getHours();
            const m = date.getMinutes().toString().padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            h = h ? h : 12; 
            const hourStr = h.toString().padStart(2, '0');

            const offsetMinutes = -date.getTimezoneOffset();
            const sign = offsetMinutes >= 0 ? '+' : '-';
            const absMin = Math.abs(offsetMinutes);
            const offsetH = Math.floor(absMin / 60);
            const offsetM = (absMin % 60).toString().padStart(2, '0');
            const gmtOffset = `GMT ${sign}${offsetH}:${offsetM}`;

            return `${day}/${month}/${year} ${hourStr}:${m} ${ampm} ${gmtOffset}`;
        } catch {
            return null;
        }
    };

    /** Validates email with a proper RFC-style regex */
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const handleEmailChange = (e) => {
        const val = e.target.value;
        setEmail(val);
        setIsEmailValid(EMAIL_RE.test(val.trim()));
    };

    return (
        <aside className={`participant-sidebar ${!isOpen ? "collapsed" : ""}`}>
            <div className="sidebar-inner">
                <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Users size={16} /> Participants
                    </h4>
                    <button 
                        onClick={onToggle}
                        style={{
                            background: "transparent", border: "none", color: "var(--text-secondary)",
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px"
                        }}
                        title="Close Sidebar"
                    >
                        <PanelLeftClose size={16} />
                    </button>
                </div>

                <div className="sidebar-list" style={{ flex: 1 }}>
                {loadingParticipants ? (
                    <div className="sidebar-empty">
                        <Loader2 size={16} className="spin" style={{ margin: "0 auto 8px" }} />
                        Loading...
                    </div>
                ) : participants.length === 0 ? (
                    <p className="sidebar-empty">
                        No participants invited yet.<br />Invite below to assign signatures!
                    </p>
                ) : (
                    participants.map((p) => {
                        const signedAt = formatSignatureDate(p.signatureDate);
                        const isSigned = p.isSigned;
                        return (
                            <div
                                key={p.participantId}
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 8,
                                    background: "var(--bg-surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: "var(--radius-sm)",
                                    padding: "10px",
                                    marginBottom: "8px"
                                }}
                            >
                                {/* Left: participant info */}
                                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                                    <span style={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: "var(--text-primary)",
                                        wordBreak: "break-all",
                                        lineHeight: 1.3,
                                    }}>
                                        {p.email}
                                    </span>

                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        fontSize: 11,
                                        fontWeight: 500,
                                        color: isSigned ? "var(--success)" : "var(--text-muted)",
                                    }}>
                                        {isSigned ? (
                                            <>
                                                <CheckCircle2 size={12} />
                                                <span>Signed</span>
                                                {signedAt && (
                                                    <span style={{
                                                        color: "var(--text-muted)",
                                                        fontWeight: 400,
                                                        marginLeft: 2,
                                                    }}>
                                                        · {signedAt}
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                {/* Pulsing dot animation for pending */}
                                                <span style={{
                                                    display: "inline-block",
                                                    width: 8, height: 8,
                                                    borderRadius: "50%",
                                                    background: "var(--text-muted)",
                                                    animation: "pulse-dot 1.5s ease-in-out infinite",
                                                    flexShrink: 0,
                                                }} />
                                                Pending
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Right: delete button — vertically centered */}
                                <button
                                    onClick={() => handleDelete(p.participantId)}
                                    disabled={isSigned || deletingId === p.participantId}
                                    style={{
                                        flexShrink: 0,
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--danger)",
                                        cursor: isSigned ? "not-allowed" : "pointer",
                                        padding: "4px",
                                        opacity: isSigned || deletingId === p.participantId ? 0.3 : 0.9,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                    title={isSigned ? "Cannot remove a signed participant" : "Revoke and Remove Participant"}
                                >
                                    {deletingId === p.participantId
                                        ? <Loader2 size={14} className="spin" />
                                        : <Trash2 size={14} />
                                    }
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Bottom Add Section */}
            <div style={{ padding: "16px", borderTop: "1px solid var(--border)", background: "var(--bg-surface-light)" }}>
                <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                        Invite new participant via email
                    </p>
                    <input
                        type="email"
                        placeholder="user@example.com"
                        value={email}
                        onChange={handleEmailChange}
                        disabled={sending}
                        style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border)",
                            background: "var(--bg-app)",
                            color: "var(--text-primary)",
                            fontSize: 13,
                        }}
                        required
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!isEmailValid || sending}
                        style={{ width: "100%", justifyContent: "center", padding: "8px" }}
                    >
                        {sending ? <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : <><Mail size={14} /> Send Invite</>}
                    </button>
                    {error && (
                        <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>
                            {error}
                        </div>
                    )}
                </form>
            </div>
            </div>
            
            <div className="sidebar-thin-btn" onClick={onToggle} title="Open Participants">
                <Users size={20} />
            </div>
        </aside>
    );
}
