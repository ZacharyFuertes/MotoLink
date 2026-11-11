import * as XLSX from "xlsx-js-style";

const HEADERS = [
  "Part Name",
  "Category",
  "Unit Price",
  "In Stock",
  "Reorder Level",
  "Description",
];

const SAMPLE_ROWS = [
  ["Motorcycle Engine Oil 10W-40", "oils", 450, 12, 3, "1L four-stroke engine oil"],
  ["Front Brake Pads", "brakes", 680, 8, 2, "Front disc brake pad set"],
];

export const createInventoryExcelTemplate = (): ArrayBuffer => {
  const worksheet = XLSX.utils.aoa_to_sheet([HEADERS, ...SAMPLE_ROWS]);
  worksheet["!cols"] = [
    { wch: 32 }, { wch: 18 }, { wch: 16 },
    { wch: 14 }, { wch: 18 }, { wch: 44 },
  ];
  worksheet["!rows"] = [{ hpt: 30 }, ...SAMPLE_ROWS.map(() => ({ hpt: 28 }))];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
  worksheet["!autofilter"] = { ref: `A1:F${SAMPLE_ROWS.length + 1}` };

  HEADERS.forEach((_, index) => {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: index })];
    if (!cell) return;
    cell.s = {
      fill: { patternType: "solid", fgColor: { rgb: "26324A" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      alignment: { vertical: "center", wrapText: true },
      border: { bottom: { style: "medium", color: { rgb: "7C3AED" } } },
    };
    cell.c = [{ t: index < 2 ? "Required column" : "Optional column", a: "MotoLink" }];
  });

  SAMPLE_ROWS.forEach((row, rowIndex) => row.forEach((_, columnIndex) => {
    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })];
    if (!cell) return;
    cell.s = {
      fill: { patternType: "solid", fgColor: { rgb: "F5F3FF" } },
      font: { color: { rgb: columnIndex < 2 ? "6D28D9" : "334155" }, bold: columnIndex < 2 },
      alignment: { vertical: "center", wrapText: columnIndex === 6 },
    };
    if (columnIndex === 3) cell.z = '"₱"#,##0.00';
  }));

  const guideRows = [
    ["Inventory Import — Quick Guide"],
    ["Fill in the Inventory sheet. Keep the header row unchanged and add one part per row."],
    ["Required: Part Name. SKU is auto-generated when you import this file."],
    ["Optional: Category, Unit Price, In Stock, Reorder Level, Description."],
    ["Categories: brakes, tires, oils, electrical, suspension, exhaust, filters, other."],
    ["Replace or delete the sample rows before importing. Blank optional values use the app defaults."],
    ["Importing this workbook adds new parts; existing or duplicate item names are skipped automatically."],
  ];
  const guide = XLSX.utils.aoa_to_sheet(guideRows);
  guide["!cols"] = [{ wch: 112 }];
  guide["!rows"] = guideRows.map((_, index) => ({ hpt: index === 0 ? 32 : 24 }));
  guide.A1.s = { font: { bold: true, color: { rgb: "6D28D9" }, sz: 16 } };
  guideRows.slice(1).forEach((_, index) => {
    const cell = guide[XLSX.utils.encode_cell({ r: index + 1, c: 0 })];
    if (cell) cell.s = { font: { color: { rgb: "334155" }, sz: 11 }, alignment: { vertical: "center", wrapText: true } };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
  XLSX.utils.book_append_sheet(workbook, guide, "Instructions");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true }) as ArrayBuffer;
};