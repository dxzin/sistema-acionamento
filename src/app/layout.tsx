import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-interface",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const themeBootstrapScript = `
  try {
    const savedTheme = localStorage.getItem("app-theme") || localStorage.getItem("dispatch-grid-theme") || "auto";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const darkMode = savedTheme === "dark" || (savedTheme === "auto" && prefersDark);
    document.documentElement.dataset.appTheme = darkMode ? "dark" : "light";
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  } catch {
    document.documentElement.dataset.appTheme = "light";
    document.documentElement.style.colorScheme = "light";
  }
`;

export const metadata: Metadata = {
  title: "Sistema de Acionamento Logístico",
  description: "Controle Operacional de Alocação e Despacho de Condutores",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} min-h-screen flex flex-col antialiased`}>
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
