/**
 * Canonical appointment/job status palette for the dark "moto" theme.
 * Single source of truth so the customer, garage and admin surfaces can't drift.
 */
export type AppointmentStatusStyle = {
  /** Human label, e.g. "In Progress". */
  label: string;
  /** Bordered pill: text + tinted bg + tinted border. */
  pill: string;
  /** Soft chip (no border): tinted bg + text. */
  soft: string;
  /** Status dot: solid tinted bg. */
  dot: string;
};

export const APPOINTMENT_STATUS: Record<string, AppointmentStatusStyle> = {
  pending: {
    label: "Pending",
    pill: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    soft: "bg-amber-500/15 text-amber-400",
    dot: "bg-amber-400",
  },
  confirmed: {
    label: "Confirmed",
    pill: "text-moto-accent bg-moto-accent/10 border-moto-accent/20",
    soft: "bg-moto-accent/15 text-moto-accent",
    dot: "bg-moto-accent",
  },
  in_progress: {
    label: "In Progress",
    pill: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    soft: "bg-sky-500/15 text-sky-400",
    dot: "bg-sky-400",
  },
  completed: {
    label: "Completed",
    pill: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    soft: "bg-emerald-500/15 text-emerald-400",
    dot: "bg-emerald-400",
  },
  declined: {
    label: "Declined",
    pill: "text-red-400 bg-red-500/10 border-red-500/20",
    soft: "bg-red-500/15 text-red-400",
    dot: "bg-red-400",
  },
  cancelled: {
    label: "Cancelled",
    pill: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    soft: "bg-rose-500/15 text-rose-400",
    dot: "bg-rose-400",
  },
  draft: {
    label: "Draft",
    pill: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    soft: "bg-slate-500/15 text-slate-400",
    dot: "bg-slate-400",
  },
};

export const UNKNOWN_APPOINTMENT_STATUS: AppointmentStatusStyle = {
  label: "Recorded",
  pill: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  soft: "bg-slate-500/15 text-slate-400",
  dot: "bg-slate-400",
};

/** Look up a status, falling back to the neutral "Recorded" style. */
export const getAppointmentStatus = (status?: string | null): AppointmentStatusStyle =>
  (status && APPOINTMENT_STATUS[status]) || UNKNOWN_APPOINTMENT_STATUS;

/**
 * Payment status colouring for invoices.
 * Covers every value allowed by the schema CHECK
 * (unpaid | paid | overdue | cancelled) plus the "partial" value the app also uses.
 */
export const PAYMENT_STATUS_TONE: Record<string, string> = {
  paid: "text-emerald-400",
  partial: "text-amber-400",
  unpaid: "text-rose-400",
  overdue: "text-rose-400",
  cancelled: "text-slate-400",
};
