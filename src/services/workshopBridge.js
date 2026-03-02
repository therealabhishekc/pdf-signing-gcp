// Workshop iframe communication bridge.
// In dev mode this module is a no-op (returns null for context).
// In production, use the useWorkshopContext hook from the SDK.

/**
 * Thin wrapper around the Workshop SDK.
 * We dynamically import so the app still loads in dev mode without the SDK wired up.
 */
export async function createWorkshopBridge() {
    const devMode = import.meta.env.VITE_DEV_MODE === "true";
    if (devMode) {
        return null; // App handles dev-mode separately
    }

    try {
        const { useWorkshopContext } = await import("@osdk/workshop-iframe-custom-widget");
        return useWorkshopContext;
    } catch {
        console.warn("Workshop SDK not available — running standalone");
        return null;
    }
}

/**
 * Variable/event schema for Workshop iframe widget configuration.
 * Paste this into the Workshop Developer Console when registering the widget.
 */
export const WORKSHOP_SCHEMA = {
    variables: {
        pdfAttachmentRid: { type: "string" }, // INPUT: RID of the PDF to sign
        signedAttachmentRid: { type: "string" }, // OUTPUT: RID of the signed PDF
    },
    events: {
        signingComplete: {}, // Fired when signing is done
    },
};
