"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
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
      name: "Relatórios",
      href: "/relatorios",
      icon: BarChart3,
      description: "Indicadores operacionais",
    },
    {
      name: "Administração",
      href: "/admin",
      icon: Settings,
      description: "Parâmetros globais",
    },
  ];

  return (
    <aside className="excel-sidebar w-44 flex flex-col justify-between select-none shrink-0">
      <div className="p-2 space-y-1">
        <div className="excel-sidebar-title px-3 py-2 text-[10px] font-semibold">
          Planilhas do arquivo
        </div>
        <nav className="space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href === "/acionamento" && pathname === "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`excel-sheet-link flex items-center px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "is-active font-semibold"
                    : ""
                }`}
              >
                <Icon className="w-4 h-4 mr-2.5 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="excel-sidebar-footer p-3 text-[10px] space-y-1">
        <div className="font-semibold">Pasta operacional</div>
        <div>Salvamento automático</div>
        <div className="font-mono">v1.1 · visual planilha</div>
      </div>
    </aside>
  );
}
