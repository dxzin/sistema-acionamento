import { DispatchRowModel } from "@/types/domain";

const HEADERS = [
  "CONDUTOR", "CIDADE", "LOGIN", "HORÁRIO", "PREVISÃO", "STATUS", "MOTIVO DO ABONO / APROVAÇÃO",
  "LOCAL", "ENTRADA", "FROTA", "C/V", "DESTINO", "DESTINO FINAL", "SAÍDA", "OBSERVAÇÃO",
  "DIA DE ESCALA", "PREV. PRÓX. DIA", "TEMPO DE JORNADA",
];

const WIDTHS = [38, 14, 13, 13, 13, 18, 34, 18, 13, 15, 9, 18, 20, 13, 30, 14, 18, 20];

const STATUS_STYLES: Record<string, { fill: string; font: string }> = {
  ACIONADO: { fill: "FFC6EFCE", font: "FF006100" },
  ABONADO: { fill: "FFFFC7CE", font: "FF9C0006" },
  APOIO: { fill: "FFFFEB9C", font: "FF9C5700" },
  BALDEIO: { fill: "FFBF9000", font: "FF1F1F1F" },
  TROCA: { fill: "FFFFFF00", font: "FF000000" },
  FALTA: { fill: "FFFF0000", font: "FFFFFFFF" },
};

function rowValues(row: DispatchRowModel) {
  return [
    row.driver.name,
    row.base?.code || "",
    row.driver.login_matricula,
    row.driver.default_start_time || "",
    row.forecast_start_time || "",
    row.dispatch_status || "",
    [row.abono_reason, row.abono_authorized_by].filter(Boolean).join(" — "),
    row.origin_location?.name || "",
    row.entry_time || "",
    row.fleet_code || row.vehicle?.plate_code || "",
    row.cargo_status || "",
    row.destination_name || row.destination_location?.name || "",
    row.final_destination_name || row.final_destination_location?.name || "",
    row.exit_time || "",
    row.observations || "",
    row.scale_day_status || "",
    row.next_day_forecast_time || "",
    row.formatted_worked_time || "",
  ];
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function addDispatchWorksheet(
  workbook: import("exceljs").Workbook,
  rows: DispatchRowModel[],
  date: string
) {
  const sheet = workbook.addWorksheet(`Acionamento ${date}`, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 1 }],
  });
  sheet.addRow(HEADERS);
  rows.forEach((row) => sheet.addRow(rowValues(row)));
  sheet.autoFilter = `A1:R${Math.max(1, rows.length + 1)}`;
  sheet.columns.forEach((column, index) => { column.width = WIDTHS[index]; });
  sheet.getRow(1).height = 24;

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF107C41" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  sheet.eachRow((excelRow, rowNumber) => {
    excelRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFB7B7B7" } },
        left: { style: "thin", color: { argb: "FFB7B7B7" } },
        bottom: { style: "thin", color: { argb: "FFB7B7B7" } },
        right: { style: "thin", color: { argb: "FFB7B7B7" } },
      };
      cell.alignment = { ...cell.alignment, vertical: "middle" };
    });
    if (rowNumber > 1) {
      excelRow.height = 21;
      [2, 3, 4, 5, 9, 10, 11, 14, 16, 17, 18].forEach((column) => {
        excelRow.getCell(column).alignment = { vertical: "middle", horizontal: "center" };
      });
      const statusCell = excelRow.getCell(6);
      const style = STATUS_STYLES[String(statusCell.value || "").trim().toLocaleUpperCase("pt-BR")];
      if (style) {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
        statusCell.font = { bold: true, color: { argb: style.font } };
        statusCell.alignment = { vertical: "middle", horizontal: "center" };
      }
    }
  });
}

export interface DispatchExportDay {
  date: string;
  rows: DispatchRowModel[];
}

export function dispatchExportDates(startDate: string, endDate: string, maximumDays = 31): string[] {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!validDate(startDate) || !validDate(endDate)) throw new Error("Informe datas válidas para exportação.");
  if (endDate < startDate) throw new Error("A data final deve ser igual ou posterior à data inicial.");

  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (dates.length > maximumDays) throw new Error(`Selecione no máximo ${maximumDays} dias por arquivo.`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function exportDispatchSheets(days: DispatchExportDay[], region: string) {
  if (!days.length) throw new Error("Nenhuma folha encontrada no período selecionado.");
  // A biblioteca pesada só é baixada quando o operador realmente exporta.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Acionamento Logístico";
  workbook.created = new Date();
  days.forEach((day) => addDispatchWorksheet(workbook, day.rows, day.date));

  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const startDate = days[0].date;
  const endDate = days[days.length - 1].date;
  link.download = startDate === endDate
    ? `acionamento_${safeFilePart(region)}_${startDate}.xlsx`
    : `acionamento_${safeFilePart(region)}_${startDate}_a_${endDate}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportDispatchSheet(rows: DispatchRowModel[], date: string, region: string) {
  await exportDispatchSheets([{ date, rows }], region);
}
