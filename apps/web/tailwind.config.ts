import type { Config } from "tailwindcss";

/**
 * PawBall Chronicles design tokens. Dark, glowing, premium-trading-card —
 * never a generic dashboard. Every colour/radius the UI uses is named here
 * so components never hardcode a hex.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#0d0a1a",
        surface: "#1c1630",
        card: "#221d38",
        purple: "#a78bfa",
        gold: "#f4c842",
        mint: "#5de8c0",
        coral: "#ff7b6b",
        ink: "#f0ebff",
        muted: "#9d8fc7",
        faint: "#5f5480",
        hair: "rgba(180,150,255,0.18)",
        rarity: {
          common: "#9d8fc7",
          uncommon: "#7bc8f6",
          rare: "#7bc8f6",
          epic: "#a78bfa",
          legendary: "#f4c842",
        },
      },
      borderColor: {
        DEFAULT: "rgba(180,150,255,0.18)",
      },
      borderRadius: {
        card: "24px",
        stat: "12px",
        badge: "20px",
        chip: "999px",
      },
      fontWeight: {
        normal: "400",
        bold: "700",
        black: "900",
      },
      letterSpacing: {
        name: "-1px",
        wide: "0.2em",
      },
      maxWidth: {
        app: "430px",
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(167,139,250,0.45)",
        "glow-gold": "0 0 28px -4px rgba(244,200,66,0.5)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
