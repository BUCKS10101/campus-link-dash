import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Project refs are the subdomain in each Supabase project's URL - not
// secrets (they're visible in every request the browser makes), so
// logging/comparing them here is safe. Used only to make the resolved
// environment unambiguous and to guard against production leaking into
// a non-production mode - never to gate anything security-relevant
// (that's RLS/grants' job, not this file's).
const PRODUCTION_PROJECT_REF = "kjsseqlmnmiuqepfmldh";
const STAGING_PROJECT_REF = "wemjskpbulebxgyhyhmk";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL ?? "";
  const isProduction = supabaseUrl.includes(PRODUCTION_PROJECT_REF);
  const isStaging = supabaseUrl.includes(STAGING_PROJECT_REF);
  const projectRef = supabaseUrl.replace(/^https?:\/\//, "").split(".")[0] || "(unset)";

  // The normal dev command (mode="development", from plain `npm run dev`)
  // must never resolve to production - only an explicit production mode
  // (`npm run build`'s default mode, or `npm run dev:production`) may.
  // This is a hard stop, not just a log: it's what actually prevents the
  // "npm run dev silently talks to production" incident from recurring,
  // even if some future .env/.env.local edit reintroduces prod values
  // into a non-production file.
  if (isProduction && mode !== "production") {
    throw new Error(
      `[env-guard] Refusing to start: resolved Supabase project is PRODUCTION (${projectRef}) ` +
      `but Vite mode is "${mode}", not "production". This almost always means a .env/.env.local ` +
      `file has production values where staging is expected. Use "npm run dev" for staging, or ` +
      `"npm run dev:production" only when you deliberately mean to target production.`
    );
  }

  const label = isProduction ? "PRODUCTION" : isStaging ? "STAGING" : "UNKNOWN";
  console.log(`\n[env-guard] mode="${mode}" -> Supabase target: ${label} (${projectRef})\n`);

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
