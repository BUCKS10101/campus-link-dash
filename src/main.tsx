import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { supabaseConfigError } from "@/lib/supabase";
import "./index.css";

// If Supabase env vars are missing, mount a setup screen instead of the app.
// Before this guard the config check threw during module import, which killed
// the bundle pre-mount and left users staring at a blank white page.
function ConfigError({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: "36rem" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>CampusLink is not configured yet</h1>
        <p style={{ lineHeight: 1.6 }}>{message}</p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  supabaseConfigError ? <ConfigError message={supabaseConfigError} /> : <App />
);
