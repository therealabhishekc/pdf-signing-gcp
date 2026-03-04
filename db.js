/**
 * MongoDB connection module for temporary signed PDF storage.
 *
 * Uses MongoDB Atlas free tier (M0) with a TTL index to
 * auto-delete documents after 3 days (259200 seconds).
 *
 * Collection: signed_pdfs
 *   _id:        string (UUID)
 *   pdfData:    Buffer (raw PDF bytes)
 *   filename:   string
 *   createdAt:  Date (used by TTL index)
 */

import { MongoClient } from "mongodb";
import crypto from "crypto";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI env var is required");
    process.exit(1);
}

const client = new MongoClient(MONGODB_URI);
let _db = null;

/** Connect to MongoDB and set up the TTL index. */
export async function connectDb() {
    await client.connect();
    _db = client.db();  // uses the DB name from the connection string
    const col = _db.collection("signed_pdfs");

    // TTL index — MongoDB auto-deletes docs 3 days after createdAt
    await col.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 259200 }  // 3 days = 3 * 24 * 60 * 60
    );
    console.log("✅ MongoDB connected, TTL index ready");
}

/**
 * Store a signed PDF in the database.
 * @param {Buffer} pdfBuffer — raw PDF bytes
 * @param {string} filename
 * @returns {Promise<string>} unique ID for retrieval
 */
export async function storePdf(pdfBuffer, filename = "signed_document.pdf") {
    const id = crypto.randomUUID();
    const col = _db.collection("signed_pdfs");
    await col.insertOne({
        _id: id,
        pdfData: pdfBuffer,
        filename,
        createdAt: new Date(),
    });
    return id;
}

/**
 * Retrieve a signed PDF by its ID.
 * @param {string} id
 * @returns {Promise<{pdfData: Buffer, filename: string} | null>}
 */
export async function getPdf(id) {
    const col = _db.collection("signed_pdfs");
    const doc = await col.findOne({ _id: id });
    if (!doc) return null;
    return { pdfData: doc.pdfData.buffer, filename: doc.filename };
}
