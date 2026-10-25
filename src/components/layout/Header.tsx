"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Activity, Clock, LogOut, Moon, Shield, Sun, Truck } from "lucide-react";
import { SighraBridgeStatus } from "./SighraBridgeStatus";
import { SupabaseUsage } from "./SupabaseUsage";

type ThemePreference = "light" | "dark" | "auto";

function BrasiliaClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("pt-BR", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  return <div className="excel-clock flex items-center space-x-1.5 px-2.5 py-1 font-mono text-xs">
    <Clock className="w-3.5 h-3.5" />
    <span className="font-bold tracking-wider">{time || "--:--:--"}</span>
    <span className="text-[10px] opacity-75">Brasília</span>
  </div>;
}

export function Header() {
  const { user, logout } = useAuth();
  const [themePreference, setThemePreference] = useState<ThemePreference>("auto");
  const [systemDark, setSystemDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("app-theme") || localStorage.getItem("dispatch-grid-theme") || "auto";
    if (["light", "dark", "auto"].includes(savedTheme)) setThemePreference(savedTheme as ThemePreference);
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
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  }, [darkMode, themePreference, themeReady]);

  return (
    <header className="excel-titlebar flex h-12 items-center justify-between px-4 sticky top-0 z-30 select-none">
      <div className="wv-brand flex items-center space-x-3">
        <div className="excel-app-icon flex h-9 w-9 items-center justify-center font-bold">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="wv-brand-title text-sm font-bold">
            Acionamento
          </h1>
          <p className="wv-brand-subtitle text-[10px]">
            Controle logístico
          </p>
        </div>
      </div>

      <div className="wv-header-status hidden items-center gap-2 lg:flex" aria-label="Estado da operação">
        <Activity className="h-4 w-4" />
        <span>Operação em tempo real</span>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {user && <SighraBridgeStatus canManage={user.role === "admin" || user.role === "supervisor"} />}
        {(user?.role === "admin" || user?.role === "supervisor") && <SupabaseUsage compact />}
        <label className="excel-theme-control flex min-h-10 items-center gap-1.5 px-2.5 text-[10px] font-bold" title="Aparência do sistema">
          {darkMode ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          <select
            value={themePreference}
            onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
            className="bg-transparent text-[10px] font-bold outline-none"
            aria-label="Aparência do sistema"
          >
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
            <option value="auto">Automático</option>
          </select>
        </label>

        <BrasiliaClock />

        {/* Informações do Usuário */}
        {user && (
          <div className="wv-user flex items-center space-x-3 pl-3">
            <div className="hidden text-right sm:block">
              <div className="wv-user-name text-xs font-semibold">{user.name}</div>
              <div className="wv-user-role flex items-center justify-end space-x-1 text-[10px] capitalize">
                <Shield className="w-3 h-3" />
                <span>{user.role}</span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sair do Sistema"
              className="wv-logout grid h-10 w-10 place-items-center transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
