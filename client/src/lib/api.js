/**
 * Resolves the backend API base URL.
 *
 * - Local dev: leave VITE_API_URL unset. Calls go to relative "/api/...",
 *   which Vite's dev server proxies to http://localhost:3001 (see vite.config.js).
 * - Production (Cloud Run, or any host where frontend and backend are
 *   separate services): set VITE_API_URL to the deployed backend's full URL,
 *   e.g. https://cocoon-backend-xxxxx-uc.a.run.app
 *
 * Vite only exposes env vars prefixed with VITE_ to client code, and only
 * reads them at build time — so this must be set before `npm run build`.
 */
const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * Builds a full API URL from a path like "/api/schedule".
 */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
