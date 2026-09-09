import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Placeholder fantasy-card palette — refined once frontend-design
        // pass happens in a later milestone. Kept minimal/real rather than
        // a long invented palette nobody has reviewed yet.
        pawball: {
          ink: "#14101c",
          gold: "#e8b84b",
          moon: "#b6bee6",
        },
      },
    },
  },
  plugins: [],
};

export default config;
