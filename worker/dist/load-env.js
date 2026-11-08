"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Worker runs as a standalone Node.js process.
 * Next.js loads `.env.local` automatically, but Node doesn't — so we load it here for local dev.
 *
 * In production (Timeweb Cloud App) prefer real environment variables.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const node_path_1 = __importDefault(require("node:path"));
// Best-effort load from repo root.
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv_1.default.config({ path: node_path_1.default.resolve(process.cwd(), ".env"), quiet: true });
