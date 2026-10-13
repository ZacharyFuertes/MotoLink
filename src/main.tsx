/// <reference types="vite/client" />
// src/main.tsx
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";

// Optional: Dev-only warning about Supabase lock issue
if (import.meta.env.DEV) {
  console.warn(
    "[WARNING] Supabase Auth Warning (Dev Only)",
    "color: orange; font-weight: bold;",
    "Session check timeout or lock errors are caused by React Strict Mode in development.",
    "They are harmless and DO NOT appear in production builds (Vercel).",
    "No action needed - auth still works after recovery.",
  );
}

// Get root element safely
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    'Root element not found. Make sure <div id="root"></div> exists in index.html',
  );
}

const root = ReactDOM.createRoot(rootElement);

// Render WITHOUT StrictMode in development to avoid Supabase lock timeouts
// StrictMode is safe to enable in production builds
root.render(
  <ThemeProvider>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </ThemeProvider>,
);
