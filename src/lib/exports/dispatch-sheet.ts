import { DispatchRowModel } from "@/types/domain";

const HEADERS = [
  "CONDUTOR", "LOGIN", "HORÁRIO", "PREVISÃO", "STATUS", "MOTIVO DO ABONO / APROVAÇÃO",
  "LOCAL", "ENTRADA", "FROTA", "C/V", "DESTINO", "DESTINO FINAL", "SAÍDA", "OBSERVAÇÃO",
  "DIA DE ESCALA", "PREV. PRÓX. DIA", "TEMPO DE JORNADA",
];

const WIDTHS = [38, 13, 13, 13, 18, 34, 18, 13, 15, 9, 18, 20, 13, 30, 14, 18, 20];

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

export async function exportDispatchSheet(rows: DispatchRowModel[], date: string, region: string) {
  // A biblioteca pesada só é baixada quando o operador realmente exporta.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Acionamento Logístico";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Acionamento ${date}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });
  sheet.addRow(HEADERS);
  rows.forEach((row) => sheet.addRow(rowValues(row)));
  sheet.autoFilter = `A1:Q${Math.max(1, rows.length + 1)}`;
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
      [3, 4, 8, 9, 10, 13, 15, 16, 17].forEach((column) => {
        excelRow.getCell(column).alignment = { vertical: "middle", horizontal: "center" };
      });
      const statusCell = excelRow.getCell(5);
      const style = STATUS_STYLES[String(statusCell.value || "").trim().toLocaleUpperCase("pt-BR")];
      if (style) {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
        statusCell.font = { bold: true, color: { argb: style.font } };
        statusCell.alignment = { vertical: "middle", horizontal: "center" };
      }
    }
  });

  const output = await workbook.xlsx.writeBuffer();
  const blob = new Blob([output as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `acionamento_${safeFilePart(region)}_${date}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
