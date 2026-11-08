import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthGate } from "./components/AuthGate";
import { AppStateProvider } from "./state";

let savedTheme: string | null = null;
try {
  savedTheme = localStorage.getItem("sg_theme");
} catch {
  /* storage blocked (private mode): follow the system theme */
}
const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
document.documentElement.setAttribute("data-theme", savedTheme === "dark" ? "dark" : savedTheme === "light" ? "light" : preferredTheme);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      {(account) => (
        // keyed by account: signing in as someone else starts from a clean slate (their own History)
        <AppStateProvider key={account} account={account}>
          <App />
        </AppStateProvider>
      )}
    </AuthGate>
  </StrictMode>,
);
