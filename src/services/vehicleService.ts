import { supabase } from "./supabaseClient";

/**
 * Vehicle data access for the customer garage.
 *
 * The `is_primary` / `edit_requested` / `edit_approved_at` columns come from
 * migration 20260926_vehicle_edit_lock.sql. Until that migration is applied
 * to the live database, PostgREST rejects any select that names them with a
 * 400, so every read goes through `runVehicleQuery`, which retries once with
 * the legacy column set and reports the degraded result.
 */

export interface VehicleRecord {
  id: string;
  customer_id: string;
  make: string;
  model: string;
  year: number | null;
  engine_number: string | null;
  created_at: string;
  is_primary: boolean;
  edit_requested: boolean;
  edit_approved_at: string | null;
}

export interface VehicleStats {
  /** Appointments in a completed state. */
  completedCount: number;
  /** Appointments that are not cancelled — this is what locks customer edits. */
  activeCount: number;
  totalSpent: number;
  lastServiceDate: string | null;
}

export const EMPTY_VEHICLE_STATS: VehicleStats = {
  completedCount: 0,
  activeCount: 0,
  totalSpent: 0,
  lastServiceDate: null,
};

export interface VehicleDraft {
  make: string;
  model: string;
  year?: number | null;
  engine_number?: string | null;
}

const VEHICLE_COLUMNS =
  "id, customer_id, make, model, year, engine_number, created_at, is_primary, edit_requested, edit_approved_at";
const VEHICLE_COLUMNS_LEGACY =
  "id, customer_id, make, model, year, engine_number, created_at";

/** Set once a read has been served by the legacy fallback in this session. */
let editLockColumnsAvailable = true;

/**
 * False once a read has proven the edit-lock migration is not applied, so
 * surfaces can hide controls that would only fail.
 */
export const areEditLockColumnsAvailable = () => editLockColumnsAvailable;

const isMissingColumnError = (error: unknown): boolean => {
  const err = error as Record<string, unknown>;
  if (err && err.code === "42703") return true;
  const message =
    typeof (err as { message?: unknown })?.message === "string"
      ? (err as { message: string }).message
      : typeof error === "string"
        ? error
        : "";
  return (
    /is_primary|edit_requested|edit_approved_at|edit_note/i.test(message) &&
    /column|schema cache|not found|could not find/i.test(message)
  );
};

/**
 * Lets a caller detect that the edit-lock migration has not been applied, so
 * admin surfaces can hide the request queue instead of showing an empty card.
 */
export const isMissingEditLockColumn = isMissingColumnError;

type QueryResult<T> = { data: T; error: unknown };

const runVehicleQuery = async <T>(
  buildQuery: (select: string) => PromiseLike<QueryResult<T>>,
): Promise<QueryResult<T>> => {
  const first = await buildQuery(VEHICLE_COLUMNS);
  if (!first.error) return first;
  if (isMissingColumnError(first.error)) {
    editLockColumnsAvailable = false;
    return await buildQuery(VEHICLE_COLUMNS_LEGACY);
  }
  return first;
};

/** Lets a surface mark the columns unavailable after its own failed query. */
export const markEditLockColumnsUnavailable = () => {
  editLockColumnsAvailable = false;
};

/** Fills in the columns the legacy fallback could not select. */
const hydrate = (rows: unknown[]): VehicleRecord[] =>
  (rows as Partial<VehicleRecord>[]).map((row) => ({
    ...(row as VehicleRecord),
    is_primary: row.is_primary ?? false,
    edit_requested: row.edit_requested ?? false,
    edit_approved_at: row.edit_approved_at ?? null,
  }));

const normalize = (value: string) => value.trim().toLowerCase();

export const vehicleLabel = (vehicle: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}): string =>
  [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Motorcycle";

export const getMyVehicles = async (
  customerId: string,
): Promise<VehicleRecord[]> => {
  const { data, error } = await runVehicleQuery<unknown[]>(
    (select) =>
      supabase
        .from("vehicles")
        .select(select)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true }),
  );
  if (error) throw error;
  const rows = hydrate(data ?? []);
  // `created_at` is a safe ordering key, but the first bike is the primary
  // one when the is_primary migration has not been applied yet.
  if (!editLockColumnsAvailable && rows.length) {
    rows[0] = { ...rows[0], is_primary: true };
  }
  return rows;
};

export const addVehicle = async (
  customerId: string,
  draft: VehicleDraft,
): Promise<VehicleRecord> => {
  const payload: Record<string, unknown> = {
    customer_id: customerId,
    make: draft.make.trim(),
    model: draft.model.trim(),
  };
  if (draft.year) payload.year = draft.year;
  if (draft.engine_number?.trim())
    payload.engine_number = draft.engine_number.trim();

  const { data, error } = await runVehicleQuery<unknown>(
    (select) =>
      supabase.from("vehicles").insert(payload).select(select).single(),
  );
  if (error) throw error;
  return hydrate([data])[0];
};

/**
 * Updates a vehicle and clears any admin-granted unlock window, since the
 * approval was for one change only.
 */
export const updateVehicle = async (
  vehicleId: string,
  draft: VehicleDraft,
): Promise<void> => {
  const payload: Record<string, unknown> = {
    make: draft.make.trim(),
    model: draft.model.trim(),
    year: draft.year ?? null,
    engine_number: draft.engine_number?.trim() || null,
  };
  if (editLockColumnsAvailable) {
    payload.edit_requested = false;
    payload.edit_approved_at = null;
  }

  const { error } = await supabase
    .from("vehicles")
    .update(payload)
    .eq("id", vehicleId);
  if (error) throw error;
};

export const deleteVehicle = async (vehicleId: string): Promise<void> => {
  const { error } = await supabase
    .from("vehicles")
    .delete()
    .eq("id", vehicleId);
  if (error) throw error;
};

export const setPrimaryVehicle = async (
  customerId: string,
  vehicleId: string,
): Promise<void> => {
  const { error } = await supabase
    .from("vehicles")
    .update({ is_primary: false })
    .eq("customer_id", customerId);
  if (error) throw error;

  const { error: primaryError } = await supabase
    .from("vehicles")
    .update({ is_primary: true })
    .eq("id", vehicleId);
  if (primaryError) throw primaryError;
};

/**
 * Per-vehicle appointment aggregates in a single query, so a garage of any
 * size costs one round trip instead of one per bike.
 */
export const getVehicleStats = async (
  vehicleIds: string[],
): Promise<Record<string, VehicleStats>> => {
  const stats: Record<string, VehicleStats> = {};
  vehicleIds.forEach((id) => {
    stats[id] = { ...EMPTY_VEHICLE_STATS };
  });
  if (!vehicleIds.length) return stats;

  const { data, error } = await supabase
    .from("appointments")
    .select("vehicle_id, status, total_amount, estimated_price, scheduled_date")
    .in("vehicle_id", vehicleIds);
  if (error) throw error;

  (data ?? []).forEach((row) => {
    const id = row.vehicle_id as string | null;
    if (!id || !stats[id]) return;
    const bucket = stats[id];
    const isCompleted = row.status === "completed";
    const isActive = row.status !== "cancelled";

    if (isCompleted) bucket.completedCount += 1;
    if (isActive) bucket.activeCount += 1;
    if (isCompleted) {
      bucket.totalSpent +=
        Number(row.total_amount || row.estimated_price || 0) || 0;
      if (
        !bucket.lastServiceDate ||
        (row.scheduled_date &&
          row.scheduled_date > bucket.lastServiceDate)
      ) {
        bucket.lastServiceDate = row.scheduled_date ?? bucket.lastServiceDate;
      }
    }
  });

  return stats;
};

/** True when the bike has any appointment that is not cancelled. */
export const hasServiceActivity = async (
  vehicleId: string,
): Promise<boolean> => {
  const { count, error } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("vehicle_id", vehicleId)
    .neq("status", "cancelled");
  if (error) throw error;
  return (count ?? 0) > 0;
};

/**
 * A vehicle is locked when it has any non-cancelled appointment, unless an
 * admin has approved a one-time unlock. The stats map is the source of truth
 * for the appointment side of that rule.
 */
export const isVehicleLocked = (
  vehicle: Pick<VehicleRecord, "edit_approved_at">,
  stats: VehicleStats | undefined,
): boolean => {
  if (vehicle.edit_approved_at) return false;
  return (stats?.activeCount ?? 0) > 0;
};

/** Flags the vehicle as awaiting an admin decision. */
export const requestVehicleEdit = async (
  vehicleId: string,
  note?: string,
): Promise<void> => {
  if (!editLockColumnsAvailable) {
    throw new Error(
      "Vehicle change requests are unavailable until the vehicle edit-lock migration is applied.",
    );
  }
  const payload: Record<string, unknown> = { edit_requested: true };
  if (note?.trim()) payload.edit_note = note.trim();
  const { error } = await supabase
    .from("vehicles")
    .update(payload)
    .eq("id", vehicleId);
  if (error) throw error;
};

/** Admin-only: grants a one-time edit window, or dismisses the request. */
export const resolveVehicleEditRequest = async (
  vehicleId: string,
  approve: boolean,
  note?: string,
): Promise<void> => {
  const { error } = await supabase
    .from("vehicles")
    .update({
      edit_requested: false,
      edit_approved_at: approve ? new Date().toISOString() : null,
      edit_note: note?.trim() || null,
    })
    .eq("id", vehicleId);
  if (error) throw error;
};

/**
 * Client-side duplicate guard. Two identical bikes are legal, so this warns
 * rather than blocks, and there is no UNIQUE constraint on the table.
 */
export const findDuplicateVehicle = (
  vehicles: VehicleRecord[],
  draft: VehicleDraft,
  excludeId?: string,
): VehicleRecord | undefined =>
  vehicles.find(
    (vehicle) =>
      vehicle.id !== excludeId &&
      normalize(vehicle.make) === normalize(draft.make) &&
      normalize(vehicle.model) === normalize(draft.model) &&
      (vehicle.year ?? null) === (draft.year ?? null),
  );
