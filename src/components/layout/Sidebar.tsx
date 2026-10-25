"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  History,
  Megaphone,
  Settings,
  Users,
  Database,
  Radio,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { canAccessPage } from "@/lib/access-control";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

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
      name: "Consulta Sighra",
      href: "/sighra",
      icon: Database,
      description: "Macros e fim de jornada",
    },
    {
      name: "Quadro de Avisos",
      href: "/avisos",
      icon: Megaphone,
      description: "Avisos e atividades",
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
    <aside className="excel-sidebar flex w-56 shrink-0 select-none flex-col justify-between">
      <div className="space-y-2 p-3">
        <div className="excel-sidebar-title px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em]">
          Navegação
        </div>
        <nav className="space-y-1">
          {navigation.filter((item) => canAccessPage(user?.role, item.href)).map((item) => {
            const isActive = pathname === item.href || (item.href === "/acionamento" && pathname === "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-label={item.name}
                title={item.description}
                className={`excel-sheet-link flex min-h-11 items-center rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? "is-active font-semibold"
                    : ""
                }`}
              >
                <span className="wv-nav-icon mr-2.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{item.name}</span>
                  <span className="wv-nav-description block truncate text-[9px] font-normal">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="excel-sidebar-footer m-3 space-y-1 rounded-xl p-3 text-[10px]">
        <div className="flex items-center gap-2 font-bold"><Radio className="h-3.5 w-3.5" /> Ambiente local</div>
        <div>Conectado ao Supabase</div>
        <div className="font-mono">cópia para testes</div>
      </div>
    </aside>
  );
}
