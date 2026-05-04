# SendGrid Email Notifications — Setup Guide

> **For:** MotoShop AutoCare Capstone Project  
> **Feature:** Automated service-completion emails to customers

---

## Overview

When an **owner/admin** finalises an appointment by clicking **"Finalize Revenue"** (marking it `completed`), the system automatically:

1. Fetches the customer's email from Supabase
2. Checks the customer's notification opt-in preference
3. Sends a rich HTML email via SendGrid containing vehicle, service, parts, and cost details
4. Logs the notification attempt in the `notifications` table

---

## Step 1 — Create a SendGrid Account

1. Go to [https://signup.sendgrid.com](https://signup.sendgrid.com) and register a free account.
2. Complete your sender identity verification (single sender or domain authentication).

> **Free tier:** 100 emails/day — more than enough for a capstone demo.

---

## Step 2 — Create an API Key

1. Log into [SendGrid Dashboard](https://app.sendgrid.com)
2. Navigate to **Settings → API Keys**
3. Click **Create API Key**
4. Choose **Restricted Access** and enable only:
   - ✅ **Mail Send** → Full Access
5. Click **Create & View**, copy the key (starts with `SG.`)

> ⚠️ **You only see the key once.** Store it safely.

---

## Step 3 — Verify a Sender Email

1. In SendGrid, go to **Settings → Sender Authentication**
2. Under **Single Sender Verification**, click **Get Started**
3. Fill in your shop's email (e.g. `noreply@yourshop.com` or your personal/Gmail)
4. Check your inbox for the verification email and confirm it

---

## Step 4 — Configure Environment Variables

Edit your `.env.local` file:

```env
VITE_SENDGRID_API_KEY="SG.your_actual_api_key_here"
VITE_SENDGRID_FROM_EMAIL="noreply@yourverifieddomain.com"
```

Then **restart the dev server** so Vite picks up the new env vars:

```bash
npm run dev
```

---

## Step 5 — Create Supabase Tables

Run the following SQL in **Supabase → SQL Editor**:

### `notifications` table (audit log)

```sql
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id    UUID    REFERENCES public.users(id) ON DELETE SET NULL,
  appointment_id  UUID    NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  type            TEXT    NOT NULL DEFAULT 'email',  -- 'email' | 'sms'
  subject         TEXT    NOT NULL,
  message         TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'sent',   -- 'sent' | 'failed' | 'skipped'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appt      ON public.notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status    ON public.notifications(status);
```

### `customer_notification_settings` table (opt-in/out)

```sql
CREATE TABLE IF NOT EXISTS public.customer_notification_settings (
  id                          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     UUID    NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
```

### RLS Policies

```sql
-- Notifications: customers see only their own rows; owners see all
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all notifications"
  ON public.notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner'));

CREATE POLICY "Customers can view own notifications"
  ON public.notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (TRUE);  -- allow from app (anon key used from browser)

-- Notification settings: users manage their own row
ALTER TABLE public.customer_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notification settings"
  ON public.customer_notification_settings
  FOR ALL
  USING (user_id = auth.uid());
```

---

## Step 6 — Test End-to-End

1. **Open** the app and log in as an **owner**
2. Navigate to **Appointments**
3. Find an appointment with status `Needs Finalization` (ready_for_finalization)
4. Click **"Finalize Revenue"** — this triggers the email
5. A **toast notification** appears in the top-right corner confirming delivery
6. Check **SendGrid Activity Feed**: [https://app.sendgrid.com/email_activity](https://app.sendgrid.com/email_activity)
7. Check the `notifications` table in Supabase for the logged record

---

## Opt-Out Flow

Customers can manage their email preferences:

1. Log in as a **customer**
2. Navigate to **My Account** (Customer Portal)
3. Click the **🔔 Notifications** button in the header
4. Toggle **Email Notifications** on/off
5. Click **Save Preferences**

If a customer opts out, the system logs a `skipped` record and shows an info toast to the owner.

---

## Testing Without a Real API Key

The service gracefully degrades when no API key is set:

```
⚠️  VITE_SENDGRID_API_KEY not set – email NOT sent.
```

This means the app won't crash — it just skips the email and logs `failed` in the DB.

---

## Files Created / Modified

| File | Purpose |
|------|---------|
| `src/services/sendgridClient.ts` | SendGrid v3 REST API wrapper |
| `src/services/notificationService.ts` | Email builder + opt-out check + DB logger |
| `src/components/NotificationPreferencesModal.tsx` | Customer opt-in/out UI |
| `src/pages/AppointmentCalendarPage.tsx` | Email trigger on `completed` status |
| `src/pages/CustomerPortal.tsx` | Notification settings button |
| `src/types/index.ts` | `EmailNotification` + `CustomerNotificationSettings` types |
| `.env.local` | SendGrid credentials (add your real key) |
| `.env.example` | Template for new developers |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `403 Forbidden` from SendGrid | API key doesn't have Mail Send permission |
| `400 Bad Request` | The `from` email is not verified in SendGrid |
| Toast says "No customer email on file" | Appointment was booked without a logged-in user (guest booking) |
| Notification logged as `failed` in DB | Check browser console → SendGrid error detail |
| `notifications` table insert fails | RLS policy missing; run the SQL above |
