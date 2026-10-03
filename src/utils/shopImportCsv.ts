/**
 * Pure helpers for the Admin Shops "Import CSV" feature.
 *
 * Kept free of React and Supabase imports so the parsing/validation rules can
 * be unit-tested directly.
 */

/** Must stay in sync with MAX_ROWS in api/import-shop-owners.ts. */
export const MAX_ROWS = 100;

/** Supabase's minimum password length. */
export const MIN_PASSWORD_LENGTH = 8;

export const REQUIRED_COLUMNS = [
  "email",
  "name",
  "shop_name",
  "shop_description",
  "shop_address",
  "shop_city",
  "shop_phone",
] as const;

export const TEMPLATE_COLUMNS = [
  ...REQUIRED_COLUMNS,
  "password",
  "latitude",
  "longitude",
];

/** Escapes a value for CSV output (quotes when needed). */
export const csvCell = (value: string | number | null | undefined): string => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type TemplateRow = (string | number)[];

/** Builds a CSV line with correct quoting (values may contain commas). */
const templateLine = (cells: TemplateRow) => cells.map(csvCell).join(",");

// NOTE: every value below goes through csvCell. Addresses contain commas
// ("123 Katipunan Ave, Quezon City") and an unquoted comma silently shifts
// every following column to the left by one.
export const TEMPLATE_CSV = [
  TEMPLATE_COLUMNS.join(","),
  templateLine([
    "maria.santos@example.com",
    "Maria Santos",
    "Santos Motorcycle Repair",
    "Full-service motorcycle repair and maintenance.",
    "123 Katipunan Ave, Quezon City",
    "Quezon City",
    "+63 917 000 0001",
    "",
    14.6488,
    121.0654,
  ]),
  templateLine([
    "juan.delacruz@example.com",
    "Juan Dela Cruz",
    "Del Cruz Bike Shop",
    "Custom parts and tuning.",
    "45 Shaw Blvd, Mandaluyong",
    "Mandaluyong",
    "+63 917 000 0002",
    "",
    14.581,
    121.035,
  ]),
].join("\n");

/** One parsed CSV row plus its validation state. */
export type ParsedRow = {
  /**
   * 1-based position among the file's data rows (the header is not counted).
   * Blank lines are skipped by the parser, so this is a row ordinal rather
   * than a physical line number in the file.
   */
  rowNumber: number;
  email: string;
  name: string;
  shop_name: string;
  shop_description: string;
  shop_address: string;
  shop_city: string;
  shop_phone: string;
  password: string;
  latitude: number | null;
  longitude: number | null;
  errors: string[];
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Normalises a header cell: "Shop Name" / " shop_name " -> "shop_name". */
export const normaliseKey = (key: string) =>
  key
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const toNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

export type ValidationResult = {
  rows: ParsedRow[];
  missingColumns: string[];
};

/**
 * Validates parsed CSV records. Every problem is collected per row — nothing is
 * silently dropped — so the admin sees the exact fix needed before importing.
 */
export const validateRows = (
  raw: Record<string, string>[],
): ValidationResult => {
  const header = raw.length > 0 ? Object.keys(raw[0]).map(normaliseKey) : [];
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !header.includes(column),
  );

  const seenEmails = new Map<string, number>();
  const rows: ParsedRow[] = raw.map((record, index) => {
    const normalised: Record<string, string> = {};
    Object.keys(record).forEach((key) => {
      normalised[normaliseKey(key)] = String(record[key] ?? "").trim();
    });
    const get = (key: string) => normalised[key] ?? "";

    const email = get("email").toLowerCase();
    const password = get("password");
    const latRaw = get("latitude");
    const lngRaw = get("longitude");
    const latitude = toNumber(latRaw);
    const longitude = toNumber(lngRaw);

    const errors: string[] = [];

    // A row with more values than the header means an unquoted comma in the
    // source (e.g. "123 Katipunan Ave, Quezon City"). PapaParse parks the
    // overflow in __parsed_extra and every later column silently shifts left,
    // so this must be an error rather than a silently mangled import.
    const extra = (record as Record<string, unknown>).__parsed_extra;
    if (Array.isArray(extra) && extra.length > 0) {
      errors.push(
        `Row has ${extra.length} more value(s) than the header — check for an unquoted comma`,
      );
    }

    REQUIRED_COLUMNS.forEach((column) => {
      if (!get(column)) errors.push(`Missing ${column}`);
    });

    if (email && !EMAIL_RE.test(email)) errors.push("Invalid email format");

    if (password && password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    if (latRaw && latitude === null) {
      errors.push("latitude must be a number");
    } else if (latitude !== null && (latitude < -90 || latitude > 90)) {
      errors.push("latitude must be between -90 and 90");
    }

    if (lngRaw && longitude === null) {
      errors.push("longitude must be a number");
    } else if (longitude !== null && (longitude < -180 || longitude > 180)) {
      errors.push("longitude must be between -180 and 180");
    }

    // Duplicates inside the file are caught here so the admin sees them in the
    // preview instead of getting one "email already registered" per row later.
    if (email) {
      const firstRow = seenEmails.get(email);
      if (firstRow !== undefined) {
        errors.push(`Duplicate email (also in row ${firstRow})`);
      } else {
        seenEmails.set(email, index + 1); // 1-based data-row ordinal
      }
    }

    return {
      rowNumber: index + 1,
      email,
      name: get("name"),
      shop_name: get("shop_name"),
      shop_description: get("shop_description"),
      shop_address: get("shop_address"),
      shop_city: get("shop_city"),
      shop_phone: get("shop_phone"),
      password,
      latitude,
      longitude,
      errors,
    };
  });

  return { rows, missingColumns };
};

/** Triggers a client-side file download. */
export const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};