"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Clock, LogOut, Shield, Truck, User } from "lucide-react";

export function Header() {
  const { user, logout } = useAuth();
  const [time, setTime] = useState<string>("");

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

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700 text-slate-100 flex items-center justify-between px-4 sticky top-0 z-30 select-none">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold">
          <Truck className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-semibold text-sm tracking-wide text-white">
            SISTEMA DE ACIONAMENTO LOGÍSTICO
          </h1>
          <p className="text-[11px] text-slate-400 font-mono">
            Controle Diário de Alocação de Condutores e Frotas
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        {/* Relógio do Sistema em Tempo Real */}
        <div className="flex items-center space-x-1.5 bg-slate-800 px-3 py-1 rounded border border-slate-700 font-mono text-xs text-emerald-400">
          <Clock className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="font-bold tracking-wider">{time || "--:--:--"}</span>
          <span className="text-[10px] text-slate-400">(Horário de Brasília)</span>
        </div>

        {/* Informações do Usuário */}
        {user && (
          <div className="flex items-center space-x-3 pl-2 border-l border-slate-700">
            <div className="text-right">
              <div className="text-xs font-medium text-slate-200">{user.name}</div>
              <div className="text-[10px] text-emerald-400 capitalize flex items-center justify-end space-x-1">
                <Shield className="w-3 h-3" />
                <span>{user.role}</span>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sair do Sistema"
              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
