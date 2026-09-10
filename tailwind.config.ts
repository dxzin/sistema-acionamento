import type { Config } from "tailwindcss";

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
        logistics: {
          dark: "#0F172A",
          sidebar: "#1E293B",
          card: "#334155",
          border: "#475569",
          gridBorder: "#CBD5E1",
          gridHeader: "#F1F5F9",
          gridHover: "#F8FAFC",
          gridSelected: "#E2E8F0",
        },
        status: {
          acionadoBg: "#DCFCE7",
          acionadoText: "#166534",
          acionadoBorder: "#86EFAC",
          abonadoBg: "#FEE2E2",
          abonadoText: "#991B1B",
          abonadoBorder: "#FCA5A5",
          apoioBg: "#FEF3C7",
          apoioText: "#92400E",
          apoioBorder: "#FCD34D",
          trocaBg: "#FEF9C3",
          trocaText: "#854D0E",
          trocaBorder: "#FDE047",
          faltaBg: "#EF4444",
          faltaText: "#FFFFFF",
          atestadoBg: "#DBEAFE",
          atestadoText: "#1E40AF",
          afastadoBg: "#FCE7F3",
          afastadoText: "#9D174D",
          viagemFechadaBg: "#E0E7FF",
          viagemFechadaText: "#3730A3",
          bateVoltaBg: "#FFEDD5",
          bateVoltaText: "#9A3412",
          suspensaoBg: "#F3E8FF",
          suspensaoText: "#6B21A8",
        },
      },
      fontSize: {
        '2xs': '0.6875rem', // 11px for ultra-dense operational grids
      },
    },
  },
  plugins: [],
};
export default config;
