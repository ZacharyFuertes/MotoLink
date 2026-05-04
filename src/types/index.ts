// User & Auth Types
export type UserRole = "owner" | "mechanic" | "customer";

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role: UserRole;
  shop_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Vehicle Types
export interface Vehicle {
  id: string;
  customer_id: string;
  make: string;
  model: string;
  created_at: string;
}

// Part/Inventory Types
export interface Part {
  id: string;
  shop_id: string;
  name: string;
  category:
    | "brakes"
    | "tires"
    | "oils"
    | "electrical"
    | "suspension"
    | "exhaust"
    | "filters"
    | "other";
  sku: string;
  unit_price: number;
  quantity_in_stock: number;
  reorder_level: number;
  supplier_id?: string;
  description?: string;
  image_url?: string;
  created_at: string;
}

// Appointment Types
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "ready_for_finalization"
  | "completed"
  | "cancelled";

export interface Appointment {
  id: string;
  customer_id: string;
  vehicle_id: string;
  shop_id: string;
  scheduled_date: string;
  scheduled_time: string;
  service_type: string;
  description?: string;
  mechanic_id?: string;
  status: AppointmentStatus;
  notes?: string;
  parts?: any[];
  total_amount?: number;
  created_at: string;
  updated_at: string;
}

// Job Order Types
export interface JobOrderPart {
  part_id: string;
  quantity_used: number;
  unit_price: number;
}

export interface JobOrder {
  id: string;
  appointment_id: string;
  customer_id: string;
  mechanic_id: string;
  shop_id: string;
  vehicle_id: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  parts_used: JobOrderPart[];
  labor_hours: number;
  labor_rate: number;
  notes?: string;
  created_at: string;
  completed_at?: string;
}

// Products Types
export interface Product {
  id: string;
  shop_id: string;
  name: string;
  description?: string;
  category: string;
  sku: string;
  unit_price: number;
  quantity_in_stock: number;
  image_url?: string;
  rating?: number;
  created_at: string;
}

// Featured Products Types
export interface FeaturedProduct {
  id: string;
  shop_id: string;
  product_id: string;
  display_order: number;
  is_active: boolean;
  product?: Product;
  created_at: string;
  updated_at: string;
}

// Staff Invitation Types
export interface StaffInvitation {
  id: string;
  token: string;
  email: string;
  role: "mechanic";
  invited_by: string;
  status: "pending" | "redeemed" | "revoked";
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// Audit Log Types
export interface AuditLogEntry {
  id: string;
  user_id?: string;
  action: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

// Invoice/Billing Types
export interface Invoice {
  id: string;
  job_order_id: string;
  customer_id: string;
  shop_id: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  payment_method?: "cash" | "check" | "card" | "gcash" | "paymaya";
  payment_status: "unpaid" | "partial" | "paid";
  due_date: string;
  issued_date: string;
  paid_date?: string;
  notes?: string;
  created_at: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  customer_id: string;
  shop_id: string;
  sender_type: "customer" | "ai" | "staff";
  message: string;
  suggested_parts?: string[];
  created_at: string;
}

// Dashboard Metrics
export interface DashboardMetrics {
  total_revenue: number;
  pending_appointments: number;
  completed_today: number;
  low_stock_parts: Part[];
  average_job_value: number;
  customer_satisfaction_score: number;
}

// Notification Types
export type NotificationType =
  | "appointment"
  | "status_update"
  | "reminder"
  | "system";

export interface Notification {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

// Email Notification (stored in `notifications` DB table)
export type NotificationDeliveryType = "email" | "sms";
export type NotificationStatus = "sent" | "failed" | "skipped";

export interface EmailNotification {
  id: string;
  recipient_id?: string;
  appointment_id: string;
  type: NotificationDeliveryType;
  subject: string;
  message: string;
  status: NotificationStatus;
  created_at: string;
  sent_at?: string;
}

// Customer notification opt-in/opt-out preferences
export interface CustomerNotificationSettings {
  id?: string;
  user_id: string;
  email_notifications_enabled: boolean;
  updated_at?: string;
}

// Form Types
export interface AppointmentFormData {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_id?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: number;
  service_type: string;
  scheduled_date: string;
  scheduled_time: string;
  description?: string;
  preferred_contact: "email" | "sms" | "whatsapp";
}

export interface PartFormData {
  name: string;
  category: Part["category"];
  sku: string;
  unit_price: number;
  quantity_in_stock: number;
  reorder_level: number;
  description?: string;
  supplier_id?: string;
}

// Language/i18n Types
export type Language = "en" | "tl";

export interface TranslationKeys {
  [key: string]: string | TranslationKeys;
}
