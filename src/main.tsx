import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ConfigurationRequired } from "@/components/ConfigurationRequired";
import { supabaseConfigError } from "@/lib/supabase";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  supabaseConfigError ? <ConfigurationRequired message={supabaseConfigError} /> : <App />,
);
