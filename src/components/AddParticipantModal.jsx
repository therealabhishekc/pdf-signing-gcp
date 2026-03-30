import React, { useState, useEffect } from "react";
import { X, Send, Mail, Trash2, CheckCircle2, Loader2, Users } from "lucide-react";
import { addParticipant, getParticipants, deleteParticipant } from "../services/attachmentService.js";

export default function AddParticipantModal({ onClose, primaryKey }) {
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

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
        fetchParticipants();
    }, [primaryKey]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !email.includes("@")) return;

        setSending(true);
        setError(null);
        try {
            await addParticipant(email, primaryKey);
            setSuccess(true);
            setEmail("");
            fetchParticipants(); // Refresh the list
        } catch (err) {
            setError(err.message || "Failed to send email");
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

    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 500 }}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center' }}>
                        <Users size={20} style={{ marginRight: 8 }} />
                        Manage Participants
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Participant List Section */}
                    <div>
                        <h4 style={{ margin: "0 0 10px 0", fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                            Current Participants
                        </h4>
                        
                        {loadingParticipants ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-secondary)" }}>
                                <Loader2 size={24} className="spin" style={{ marginBottom: 8 }} />
                                <div>Loading participants...</div>
                            </div>
                        ) : participants.length === 0 ? (
                            <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "6px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
                                No participants invited yet.
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "200px", overflowY: "auto" }}>
                                {participants.map(p => (
                                    <div key={p.participantId} style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between", 
                                        padding: "10px 14px", background: "var(--bg-secondary)", 
                                        borderRadius: "6px", border: "1px solid var(--border-color)"
                                    }}>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                            <span style={{ fontSize: 14, fontWeight: 500 }}>{p.email}</span>
                                            <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: p.isSigned ? "var(--success-color)" : "var(--text-secondary)" }}>
                                                {p.isSigned ? (
                                                    <><CheckCircle2 size={12} /> Signed</>
                                                ) : (
                                                    <><Loader2 size={12} /> Pending Signature</>
                                                )}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(p.participantId)}
                                            disabled={deletingId === p.participantId}
                                            style={{
                                                background: "none", border: "none", color: "var(--danger-color)",
                                                cursor: "pointer", padding: "6px", borderRadius: "4px",
                                                opacity: deletingId === p.participantId ? 0.5 : 0.8
                                            }}
                                            title="Remove Participant"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <hr style={{ border: 0, borderTop: "1px solid var(--border-color)", margin: "0" }} />

                    {/* Invite New Section */}
                    {success ? (
                        <div style={{ textAlign: "center", padding: "10px 0" }}>
                            <div style={{ color: "var(--success-color)", marginBottom: 12 }}>
                                <Send size={32} />
                            </div>
                            <h4>Invite Sent!</h4>
                            <p style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: 13 }}>
                                An email has been sent to <strong>{email}</strong>.
                            </p>
                            <button className="btn btn-ghost" onClick={() => setSuccess(false)} style={{ marginTop: 12 }}>
                                Invite Another
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <h4 style={{ margin: "0 0 10px 0", fontSize: 13, textTransform: "uppercase", color: "var(--text-secondary)", letterSpacing: "0.5px" }}>
                                Invite New Participant
                            </h4>
                            <p style={{ color: "var(--text-secondary)", marginBottom: 16, fontSize: 13 }}>
                                They will receive an email with a secure, mathematically signed link tracking their progress.
                            </p>

                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    type="email"
                                    placeholder="participant@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: "10px 12px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--border-color)",
                                        background: "var(--bg-secondary)",
                                        color: "var(--text-primary)",
                                        fontSize: 14,
                                        outline: "none"
                                    }}
                                    disabled={sending}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={!email.trim() || sending}
                                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                                >
                                    {sending ? <Loader2 size={16} className="spin" /> : <Mail size={16} />}
                                    Send
                                </button>
                            </div>

                            {error && (
                                <div style={{ color: "var(--danger-color)", fontSize: 13, marginTop: 12 }}>
                                    {error}
                                </div>
                            )}
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
