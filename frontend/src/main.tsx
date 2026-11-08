import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { AuthGate } from "./components/AuthGate";
import { AppStateProvider } from "./state";

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
