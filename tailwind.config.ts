import type { Config } from "tailwindcss";

// Palette sampled from the ThankBot mascot: a blurple field, a near-white
// robot with a deep navy screen, an aqua smile, and a coral-to-crimson heart.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          50: "#f3f0ff",
          100: "#eae3ff",
          200: "#d7cbff",
          300: "#bba7ff",
          400: "#9a78fc",
          500: "#7f4ef8",
          600: "#6436f2",
          700: "#5526d9",
          800: "#4720b0",
          900: "#3b1e8c",
          950: "#230f5e",
        },
        ink: {
          50: "#f8f8fc",
          100: "#f0eff8",
          200: "#e0dfee",
          300: "#c5c3dd",
          400: "#9b98bd",
          500: "#74709a",
          600: "#57547a",
          700: "#434061",
          800: "#2c2a47",
          900: "#1e1b3c",
          950: "#12102a",
        },
        heart: {
          50: "#fff1f3",
          100: "#ffe0e4",
          200: "#ffc6ce",
          300: "#ff9dab",
          400: "#fb5e6b",
          500: "#f5385f",
          600: "#e01752",
          700: "#bd0f45",
          800: "#9d103f",
          900: "#86123c",
        },
        aqua: {
          50: "#eafffc",
          100: "#cbfff8",
          200: "#9dfdf3",
          300: "#5ef3e9",
          400: "#29ded6",
          500: "#12c1bd",
          600: "#089a99",
          700: "#0d7a7a",
          800: "#116061",
          900: "#134f51",
        },
      },
    },
  },
  plugins: [],
};
export default config;
