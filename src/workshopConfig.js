/**
 * Workshop Bidirectional Iframe — Config Definition
 *
 * Declares the fields and events this widget exposes to Workshop.
 * Workshop auto-discovers these when the app is embedded as a Bidirectional iframe,
 * and shows configuration pickers in the widget's settings panel.
 *
 * @see https://www.palantir.com/docs/foundry/workshop/widgets-iframe#bidirectional
 * @see https://www.npmjs.com/package/@osdk/workshop-iframe-custom-widget
 */

export const SIGNING_WIDGET_CONFIG = [
    {
        fieldId: "pdfAttachmentRid",
        field: {
            type: "single",
            label: "PDF Attachment RID",
            fieldValue: {
                type: "inputOutput",
                variableType: {
                    type: "string",
                    defaultValue: undefined,
                },
            },
        },
    },
    {
        fieldId: "fileObjectPrimaryKey",
        field: {
            type: "single",
            label: "File Object Primary Key",
            fieldValue: {
                type: "inputOutput",
                variableType: {
                    type: "string",
                    defaultValue: undefined,
                },
            },
        },
    },
    {
        fieldId: "signedAttachmentRid",
        field: {
            type: "single",
            label: "Signed PDF Attachment RID",
            fieldValue: {
                type: "inputOutput",
                variableType: {
                    type: "string",
                    defaultValue: undefined,
                },
            },
        },
    },
    {
        fieldId: "onSignComplete",
        field: {
            type: "single",
            label: "On Sign Complete",
            fieldValue: {
                type: "event",
            },
        },
    },
];
