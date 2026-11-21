import type { Config } from "tailwindcss";

// Colors follow the design canvas (Adaptive AI Meal Planner phone app).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#D92D20", soft: "#FEF3F2", dark: "#B42318" },
        ink: { DEFAULT: "#141414", muted: "#6B6B6B" },
        line: "#E3E3E0",
        surface: "#F7F7F6",
      },
    },
  },
  plugins: [],
};
export default config;
