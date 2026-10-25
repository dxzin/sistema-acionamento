"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, Hourglass, LogIn, ShieldQuestion } from "lucide-react";
import { OperationalAlertSummary } from "@/lib/calculations/operational-alerts";

interface OperationalAlertsProps {
  summary: OperationalAlertSummary;
  activeClosingFilter?: "upcoming" | "overdue" | null;
  onClosingFilterChange?: (filter: "upcoming" | "overdue" | null) => void;
}

export function OperationalAlerts({ summary, activeClosingFilter = null, onClosingFilterChange }: OperationalAlertsProps) {
  const alerts = [
    { label: "Acionados sem entrada", value: summary.acionadosSemEntrada, icon: LogIn, tone: "warning" },
    { label: "Jornadas abertas", value: summary.jornadasAbertas, icon: Clock3, tone: "info" },
    { label: "Abonos pendentes", value: summary.abonosPendentes, icon: ShieldQuestion, tone: "warning" },
    { label: "Acima de 11h10", value: summary.jornadasAcimaDoLimite, icon: AlertTriangle, tone: "danger" },
    { label: "Fechar em até 2h", value: summary.fechamentosProximos, icon: Hourglass, tone: "warning", filter: "upcoming" as const },
    { label: "Fechamento atrasado", value: summary.fechamentosAtrasados, icon: AlertTriangle, tone: "danger", filter: "overdue" as const },
  ].filter((alert) => alert.value > 0);

  if (!alerts.length) {
    return (
      <div className="excel-operational-alerts is-clear" role="status">
        <CheckCircle2 aria-hidden="true" /> Nenhuma pendência operacional identificada nesta visualização.
      </div>
    );
  }

  return (
    <div className="excel-operational-alerts" aria-label="Pendências operacionais da visualização atual">
      <strong>Pontos de atenção</strong>
      {alerts.map(({ label, value, icon: Icon, tone, filter }) => filter ? (
        <button
          type="button"
          key={label}
          className={`is-${tone} ${activeClosingFilter === filter ? "is-active" : ""}`}
          title={`${value} registro(s): ${label.toLocaleLowerCase("pt-BR")}. Clique para filtrar.`}
          aria-pressed={activeClosingFilter === filter}
          onClick={() => onClosingFilterChange?.(activeClosingFilter === filter ? null : filter)}
        >
          <Icon aria-hidden="true" /> <b>{value}</b> {label}
        </button>
      ) : (
        <span key={label} className={`is-${tone}`} title={`${value} registro(s): ${label.toLocaleLowerCase("pt-BR")}`}>
          <Icon aria-hidden="true" /> <b>{value}</b> {label}
        </span>
      ))}
    </div>
  );
}
