"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Clock, LogOut, Moon, Shield, Sun, Truck } from "lucide-react";

type ThemePreference = "light" | "dark" | "auto";

export function Header() {
  const { user, logout } = useAuth();
  const [time, setTime] = useState<string>("");
  const [themePreference, setThemePreference] = useState<ThemePreference>("light");
  const [systemDark, setSystemDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("pt-BR", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("app-theme") || localStorage.getItem("dispatch-grid-theme");
    if (["light", "dark", "auto"].includes(savedTheme || "")) setThemePreference(savedTheme as ThemePreference);
    setThemeReady(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setSystemDark(media.matches);
    syncTheme();
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);

  const darkMode = themePreference === "dark" || (themePreference === "auto" && systemDark);

  useEffect(() => {
    if (!themeReady) return;
    localStorage.setItem("app-theme", themePreference);
    document.documentElement.dataset.appTheme = darkMode ? "dark" : "light";
  }, [darkMode, themePreference, themeReady]);

  return (
    <header className="excel-titlebar h-12 flex items-center justify-between px-3 sticky top-0 z-30 select-none">
      <div className="flex items-center space-x-3">
        <div className="excel-app-icon w-7 h-7 flex items-center justify-center font-bold">
          <Truck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-semibold text-sm text-white">
            Controle Operacional.xlsx
          </h1>
          <p className="text-[10px] text-emerald-100">
            Sistema de Acionamento Logístico
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <label className="excel-theme-control flex h-7 items-center gap-1 border border-white/25 bg-black/10 px-1.5 text-[10px] font-bold text-white" title="Tema do sistema">
          {darkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          <select
            value={themePreference}
            onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
            className="bg-transparent text-[10px] font-bold text-white outline-none"
            aria-label="Tema do sistema"
          >
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
            <option value="auto">Automático</option>
          </select>
        </label>

        {/* Relógio do Sistema em Tempo Real */}
        <div className="excel-clock flex items-center space-x-1.5 px-2.5 py-1 font-mono text-xs">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-bold tracking-wider">{time || "--:--:--"}</span>
          <span className="text-[10px] opacity-75">Brasília</span>
        </div>

        {/* Informações do Usuário */}
        {user && (
          <div className="flex items-center space-x-3 pl-3 border-l border-emerald-600">
            <div className="text-right">
              <div className="text-xs font-medium text-white">{user.name}</div>
              <div className="text-[10px] text-emerald-100 capitalize flex items-center justify-end space-x-1">
                <Shield className="w-3 h-3" />
                <span>{user.role}</span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sair do Sistema"
              className="p-1.5 text-emerald-100 hover:text-white hover:bg-emerald-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
