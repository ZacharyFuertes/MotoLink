import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        moto: {
          50: "#edf7fb",
          100: "#d9f2f8",
          200: "#b2ddec",
          300: "#80c3db",
          400: "#4f9cbf",
          500: "#2f7aa8",
          600: "#25638f",
          700: "#1d4c71",
          800: "#172f55",
          900: "#0c1c34",
          accent: "#38b6c4",
          dark: "#0f1723",
          darker: "#0b1526",
          gray: "#25334e",
          "gray-light": "#334155",
          "gray-muted": "#64748b",
          "accent-dark": "#0f6b87",
          "accent-orange": "#fb923c",
          "accent-neon": "#22c55e",
          light: "#f8fafc",
          muted: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Bebas Neue", "Poppins", "system-ui", "sans-serif"],
        mono: ["Courier Prime", "monospace"],
      },
      fontSize: {
        // Tighter scale with explicit line-heights
        "display-xl": ["3rem", { lineHeight: "1.05", letterSpacing: "0.08em" }],
        "display-lg": [
          "2.25rem",
          { lineHeight: "1.05", letterSpacing: "0.07em" },
        ],
        "display-md": [
          "1.5rem",
          { lineHeight: "1.1", letterSpacing: "0.06em" },
        ],
        "display-sm": [
          "1.125rem",
          { lineHeight: "1.15", letterSpacing: "0.05em" },
        ],
        // Body scale with comfortable line-heights
        "body-lg": ["1rem", { lineHeight: "1.75", letterSpacing: "0.01em" }],
        "body-md": ["0.875rem", { lineHeight: "1.7", letterSpacing: "0.01em" }],
        "body-sm": ["0.75rem", { lineHeight: "1.65", letterSpacing: "0.02em" }],
        // Meta/label text — uppercase needs extra tracking
        "label-lg": [
          "0.8125rem",
          { lineHeight: "1.5", letterSpacing: "0.12em" },
        ],
        "label-md": ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.14em" }],
        "label-sm": [
          "0.6875rem",
          { lineHeight: "1.5", letterSpacing: "0.16em" },
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.02em",
        tight: "-0.01em",
        normal: "0em",
        wide: "0.04em",
        wider: "0.08em",
        widest: "0.16em",
        // Bebas Neue / all-caps specific
        "display-normal": "0.06em",
        "display-wide": "0.1em",
        "caps-normal": "0.12em",
        "caps-wide": "0.18em",
      },
      lineHeight: {
        display: "1.05",
        "snug-display": "1.1",
        "tight-body": "1.5",
        "normal-body": "1.7",
        "loose-body": "1.85",
      },
      spacing: {
        // Consistent vertical rhythm units
        "meta-gap": "0.75rem", // gap between icon + text in meta rows (increased for readability)
        "meta-row": "0.75rem", // gap between successive meta rows (increased)
        section: "1.5rem", // gap between card sections
        "card-pad": "1.25rem", // card internal padding
        "card-pad-lg": "1.75rem",
      },
      backgroundImage: {
        "gradient-dark":
          "linear-gradient(135deg, rgba(10,10,10,0.85), rgba(20,20,20,0.95))",
        "gradient-overlay":
          "linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.85))",
        "gradient-accent": "linear-gradient(135deg, #e63946 0%, #f97316 100%)",
        "gradient-card":
          "linear-gradient(160deg, rgba(36,36,36,0.9), rgba(20,20,20,1))",
      },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
        "card-hover":
          "0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)",
        "accent-glow": "0 0 12px rgba(230,57,70,0.35)",
        "date-badge": "inset 0 1px 0 rgba(255,255,255,0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-in-out",
        "slide-up": "slideUp 0.7s ease-out",
        "pulse-accent": "pulse-accent 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 3s ease-in-out infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "pulse-accent": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  darkMode: "class",
  plugins: [],
} satisfies Config;
