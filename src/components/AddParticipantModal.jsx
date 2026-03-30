import React, { useState } from "react";
import { X, Send, Mail } from "lucide-react";
import { sendParticipantEmail } from "../services/attachmentService.js";

export default function AddParticipantModal({ onClose, primaryKey }) {
    const [email, setEmail] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !email.includes("@")) return;

        setSending(true);
        setError(null);
        try {
            await sendParticipantEmail(email, primaryKey);
            setSuccess(true);
        } catch (err) {
            setError(err.message || "Failed to send email");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ maxWidth: 450 }}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center' }}>
                        <Mail size={20} style={{ marginRight: 8 }} />
                        Add Participant
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {success ? (
                        <div style={{ textAlign: "center", padding: "20px 0" }}>
                            <div style={{ color: "var(--success-color)", marginBottom: 12 }}>
                                <Send size={48} />
                            </div>
                            <h3>Invite Sent!</h3>
                            <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>
                                An email has been sent to <strong>{email}</strong> with a link to sign this document.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
                                Invite someone to view and sign this particular PDF document. They will receive an email with a secure link.
                            </p>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <label htmlFor="emailInput" style={{ fontWeight: 500 }}>Email Address</label>
                                <input
                                    id="emailInput"
                                    type="email"
                                    placeholder="participant@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    style={{
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
                            </div>

                            {error && (
                                <div style={{ color: "var(--danger-color)", fontSize: 13, marginTop: 12 }}>
                                    {error}
                                </div>
                            )}

                            <div className="modal-footer" style={{ marginTop: 24 }}>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={onClose}
                                    disabled={sending}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={!email.trim() || sending}
                                >
                                    {sending ? "Sending..." : "Send Invite"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {success && (
                    <div className="modal-footer">
                        <button className="btn btn-primary" onClick={onClose}>
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
