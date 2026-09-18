function safeFileName(value) {
  return String(value || "bao-cao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function cellValue(row, column) {
  const value = typeof column.value === "function" ? column.value(row) : row?.[column.key];
  if (value === null || value === undefined) return "";
  return String(value);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function download(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportCsv({ name, columns, rows }) {
  const lines = [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(cellValue(row, column))).join(",")),
  ];
  download(
    `\uFEFF${lines.join("\r\n")}`,
    `${safeFileName(name)}.csv`,
    "text/csv;charset=utf-8",
  );
}

export function exportExcel({ name, sheetName = "Bao cao", columns, rows }) {
  const headerCells = columns
    .map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlText(column.label)}</Data></Cell>`)
    .join("");
  const dataRows = rows.map((row) => {
    const cells = columns
      .map((column) => `<Cell><Data ss:Type="String">${xmlText(cellValue(row, column))}</Data></Cell>`)
      .join("");
    return `<Row>${cells}</Row>`;
  }).join("");
  const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EAF2FF" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="${xmlText(sheetName).slice(0, 31)}"><Table><Row>${headerCells}</Row>${dataRows}</Table></Worksheet>
</Workbook>`;
  download(
    `\uFEFF${workbook}`,
    `${safeFileName(name)}.xls`,
    "application/vnd.ms-excel;charset=utf-8",
  );
}
