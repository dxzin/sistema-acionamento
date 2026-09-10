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
