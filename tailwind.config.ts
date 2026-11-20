import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#E5322D", soft: "#FDECEC", dark: "#C42722" },
        ink: { DEFAULT: "#111111", muted: "#6B6B6B" },
        line: "#E3E3E3",
        surface: "#F4F4F4",
      },
    },
  },
  plugins: [],
};
export default config;
