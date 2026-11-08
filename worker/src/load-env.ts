/**
 * Worker runs as a standalone Node.js process.
 * Next.js loads `.env.local` automatically, but Node doesn't — so we load it here for local dev.
 *
 * In production (Timeweb Cloud App) prefer real environment variables.
 */
import dotenv from "dotenv";
import path from "node:path";

// Best-effort load from repo root.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

