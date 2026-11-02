import * as XLSX from "xlsx-js-style";
import { TEMPLATE_COLUMNS, TEMPLATE_ROWS } from "./shopImportCsv";

const HEADER_FILL = { patternType: "solid", fgColor: { rgb: "26324A" } };
const HEADER_FONT = { bold: true, color: { rgb: "FFFFFF" }, sz: 11 };
const REQUIRED_FONT = { bold: true, color: { rgb: "7C3AED" } };
const SAMPLE_FILL = { patternType: "solid", fgColor: { rgb: "F5F3FF" } };

export const createShopOwnerExcelTemplate = (): ArrayBuffer => {
  const rows: unknown[][] = [TEMPLATE_COLUMNS, ...TEMPLATE_ROWS];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  worksheet["!cols"] = [
    { wch: 32 }, { wch: 24 }, { wch: 32 }, { wch: 50 }, { wch: 38 },
    { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  worksheet["!autofilter"] = { ref: `A1:J${Math.max(rows.length, 2)}` };

  for (let column = 0; column < TEMPLATE_COLUMNS.length; column += 1) {
    const cell = XLSX.utils.encode_cell({ r: 0, c: column });
    if (!worksheet[cell]) continue;
    worksheet[cell].s = {
      fill: HEADER_FILL,
      font: HEADER_FONT,
      alignment: { vertical: "center", wrapText: true },
      border: { bottom: { style: "medium", color: { rgb: "7C3AED" } } },
    };
  }
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    for (let column = 0; column < TEMPLATE_COLUMNS.length; column += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: column });
      const cell = worksheet[cellAddress];
      if (!cell) continue;
      cell.s = { fill: SAMPLE_FILL, alignment: { vertical: "top", wrapText: true } };
      if (column < 7) cell.s.font = REQUIRED_FONT;
    }
  }
  worksheet["!rows"] = [{ hpt: 32 }, ...rows.slice(1).map(() => ({ hpt: 42 }))];

  const instructions = [
    ["Shop Owner Import — Quick Guide"],
    ["Fill in the Shop Owners sheet. Keep the header row unchanged and add one owner per row."],
    ["Required columns: email, name, shop_name, shop_description, shop_address, shop_city, shop_phone."],
    ["Optional: password (leave blank to generate a temporary password), latitude, longitude."],
    ["Limit: 100 data rows per import. Save as .xlsx or export to CSV before uploading."],
    ["Addresses and descriptions may contain commas; in CSV files, keep them quoted."],
  ];
  const guide = XLSX.utils.aoa_to_sheet(instructions);
  guide["!cols"] = [{ wch: 115 }];
  guide["!rows"] = instructions.map((_, index) => ({ hpt: index === 0 ? 30 : 24 }));
  guide.A1.s = { font: { bold: true, color: { rgb: "6D28D9" }, sz: 16 } };
  for (let row = 1; row < instructions.length; row += 1) {
    const cell = guide[XLSX.utils.encode_cell({ r: row, c: 0 })];
    if (cell) cell.s = { alignment: { wrapText: true, vertical: "center" }, font: { color: { rgb: "334155" }, sz: 11 } };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Shop Owners");
  XLSX.utils.book_append_sheet(workbook, guide, "Instructions");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true }) as ArrayBuffer;
};
