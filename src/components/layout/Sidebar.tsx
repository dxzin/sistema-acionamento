"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  History,
  Settings,
  Users,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const navigation = [
    {
      name: "Acionamento",
      href: "/acionamento",
      icon: ClipboardList,
      description: "Grade diária de despacho",
    },
    {
      name: "Escala Mensal",
      href: "/escala",
      icon: CalendarDays,
      description: "Planejamento mensal",
    },
    {
      name: "Condutores",
      href: "/condutores",
      icon: Users,
      description: "Cadastro e bases",
    },
    {
      name: "Histórico",
      href: "/historico",
      icon: History,
      description: "Auditoria e consultas",
    },
    {
      name: "Administração",
      href: "/admin",
      icon: Settings,
      description: "Parâmetros globais",
    },
  ];

  return (
    <aside className="w-52 bg-slate-900 border-r border-slate-700 flex flex-col justify-between select-none shrink-0">
      <div className="p-2 space-y-1">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Módulos Operacionais
        </div>
        <nav className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href === "/acionamento" && pathname === "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-3 py-2 text-xs font-medium rounded transition-colors ${
                  isActive
                    ? "bg-emerald-700 text-white shadow-sm font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 mr-2.5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-3 border-t border-slate-800 text-[10px] text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300">Modo Operacional</div>
        <div>Substituição Excel Ativa</div>
        <div className="text-emerald-400 font-mono">v1.0.0 (Fase 1)</div>
      </div>
    </aside>
  );
}
