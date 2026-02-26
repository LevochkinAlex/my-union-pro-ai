import type { Config } from "tailwindcss";
import { heroui } from "@heroui/react";

type TailwindConfig = Config & { safelist?: string[] };

const config: TailwindConfig = {
  safelist: [
    // Progress bar widths (dynamic percentage in statistics)
    ...Array.from({ length: 101 }, (_, i) => `w-[${i}%]`),
  ],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [heroui()],
};

export default config;
