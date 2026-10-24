import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASS || "").replace(/\s+/g, "");
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "MotoLink";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const messageFor = (part: { name: string; quantity_in_stock: number; reorder_level: number }) =>
  part.quantity_in_stock <= 0
    ? `${part.name} is out of stock. Restock it as soon as possible.`
    : `${part.name} has ${part.quantity_in_stock} unit${part.quantity_in_stock === 1 ? "" : "s"} remaining, at or below the reorder level of ${part.reorder_level}.`;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: "Notification service is not configured." });
  }

  try {
    const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    const { partId, previousQuantity, previousReorderLevel } = req.body || {};
    const isNewPartAlert = previousQuantity === null && previousReorderLevel === null;
    if (
      !token ||
      !partId ||
      (!isNewPartAlert &&
        (!Number.isFinite(Number(previousQuantity)) ||
          !Number.isFinite(Number(previousReorderLevel))))
    ) {
      return res.status(400).json({ success: false, error: "A valid session and stock transition are required." });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const auth = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: authData, error: authError } = await auth.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ success: false, error: "Session is invalid." });
    }

    const [{ data: caller }, { data: part, error: partError }] = await Promise.all([
      db.from("users").select("id, role, shop_id").eq("id", authData.user.id).maybeSingle(),
      db.from("parts").select("id, shop_id, name, sku, quantity_in_stock, reorder_level").eq("id", partId).maybeSingle(),
    ]);
    if (partError || !part) {
      return res.status(404).json({ success: false, error: "Inventory item not found." });
    }

    const { data: shop } = await db
      .from("shops")
      .select("id, name, owner_id")
      .eq("id", part.shop_id)
      .maybeSingle();
    let { data: owner } = await db
      .from("users")
      .select("id, email, name")
      .eq("role", "owner")
      .eq("shop_id", part.shop_id)
      .maybeSingle();
    if (!owner && shop?.owner_id) {
      const { data: ownerById } = await db
        .from("users")
        .select("id, email, name")
        .eq("id", shop.owner_id)
        .eq("role", "owner")
        .maybeSingle();
      owner = ownerById;
    }
    const isOwner = caller?.role === "owner" &&
      (caller.shop_id === part.shop_id || shop?.owner_id === caller.id);
    const isAdmin = caller?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: "Not authorized for this shop." });
    }

    const oldQty = isNewPartAlert ? null : Number(previousQuantity);
    const oldReorderLevel = isNewPartAlert ? null : Number(previousReorderLevel);
    const currentQty = Number(part.quantity_in_stock);
    const reorderLevel = Number(part.reorder_level) || 0;
    const createdLow = isNewPartAlert && currentQty <= reorderLevel;
    const crossedIntoLow =
      oldQty !== null &&
      oldReorderLevel !== null &&
      oldQty > oldReorderLevel &&
      currentQty <= reorderLevel;
    const becameOutOfStock = oldQty !== null && oldQty > 0 && currentQty <= 0;
    if (!createdLow && !crossedIntoLow && !becameOutOfStock) {
      return res.status(200).json({ success: true, skipped: true, reason: "No low-stock threshold crossing." });
    }

    const { data: setting } = await db
      .from("platform_settings")
      .select("setting_value")
      .eq("setting_key", "notif_low_stock")
      .maybeSingle();
    if (setting?.setting_value?.value === false) {
      return res.status(200).json({ success: true, skipped: true, reason: "Low-stock notifications disabled." });
    }

    const recipientId = shop?.owner_id || owner?.id;
    const recipientEmail = owner?.email;
    if (!recipientId || !recipientEmail) {
      return res.status(200).json({ success: false, error: "Shop owner email is unavailable." });
    }

    const subject = currentQty <= 0 ? `Out of stock: ${part.name}` : `Low stock alert: ${part.name}`;
    const message = messageFor({ name: part.name, quantity_in_stock: currentQty, reorder_level: reorderLevel });
    const alertMessage = `${message}${part.sku ? ` SKU: ${part.sku}.` : ""}`;

    // The UI passes only threshold crossings. This duplicate guard protects
    // against concurrent callers and repeated requests from a stale client.
    const duplicateSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: duplicate } = await db
      .from("notifications")
      .select("id")
      .eq("recipient_id", recipientId)
      .eq("type", "low_stock")
      .eq("subject", subject)
      .eq("message", alertMessage)
      .gte("created_at", duplicateSince)
      .limit(1)
      .maybeSingle();
    if (duplicate) {
      return res.status(200).json({ success: true, skipped: true, reason: "Duplicate alert recently sent." });
    }

    const notification = await db.from("notifications").insert({
      recipient_id: recipientId,
      type: "low_stock",
      subject,
      message: alertMessage,
      status: "pending",
      read: false,
    }).select("id").single();
    if (notification.error || !notification.data) {
      console.error("[low-stock-alert] could not queue notification:", notification.error);
      return res.status(500).json({ success: false, error: "Could not create the low-stock notification." });
    }

    const shopName = shop?.name || "your shop";
    const details = [
      `<tr><td style="padding:10px 14px;color:#64748b;">Item</td><td style="padding:10px 14px;color:#0f172a;font-weight:700;">${escapeHtml(part.name)}</td></tr>`,
      `<tr><td style="padding:10px 14px;color:#64748b;">SKU</td><td style="padding:10px 14px;color:#0f172a;font-weight:700;">${escapeHtml(part.sku || "Not set")}</td></tr>`,
      `<tr><td style="padding:10px 14px;color:#64748b;">Current stock</td><td style="padding:10px 14px;color:#b91c1c;font-weight:800;">${currentQty}</td></tr>`,
      `<tr><td style="padding:10px 14px;color:#64748b;">Reorder level</td><td style="padding:10px 14px;color:#0f172a;font-weight:700;">${reorderLevel}</td></tr>`,
    ].join("");
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="padding:24px 28px;background:#0f172a;color:#fff"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#35d0c0">MOTOLINK INVENTORY</div><h1 style="font-size:24px;margin:10px 0 4px">${currentQty <= 0 ? "Item out of stock" : "Low stock alert"}</h1><p style="margin:0;color:#cbd5e1">${escapeHtml(shopName)}</p></td></tr><tr><td style="padding:24px 28px"><p style="font-size:15px;line-height:1.6">${escapeHtml(message)}</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">${details}</table><p style="font-size:13px;line-height:1.6;color:#475569">Open your MotoLink dashboard and visit Low Stock Alerts to restock or review this item.</p></td></tr><tr><td style="padding:16px 28px;background:#0f172a;color:#94a3b8;text-align:center;font-size:12px">Automatic inventory alert · MotoLink</td></tr></table></td></tr></table></body></html>`;
    const text = `MOTOLINK INVENTORY ALERT\n${shopName}\n\n${message}\nSKU: ${part.sku || "Not set"}\nCurrent stock: ${currentQty}\nReorder level: ${reorderLevel}\n\nOpen your MotoLink dashboard and visit Low Stock Alerts.`;

    try {
      if (GMAIL_USER && GMAIL_APP_PASS) {
        const transporter = nodemailer.createTransport({ service: "gmail", host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS } });
        await transporter.sendMail({ from: `"${FROM_NAME}" <${GMAIL_USER}>`, to: recipientEmail, subject, html, text });
      } else if (SENDGRID_API_KEY && FROM_EMAIL) {
        sgMail.setApiKey(SENDGRID_API_KEY);
        await sgMail.send({ to: recipientEmail, from: { email: FROM_EMAIL, name: FROM_NAME }, subject, html, text });
      } else {
        throw new Error("No email provider is configured.");
      }

      await db.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", notification.data.id);
      console.log(`[low-stock-alert] emailed shop owner for part ${part.id}`);
      return res.status(200).json({ success: true });
    } catch (emailError: any) {
      const errorText = emailError?.message || "Email delivery failed.";
      console.error("[low-stock-alert] email delivery failed:", errorText);
      await db.from("notifications").update({ status: "failed", message: `${message} Email delivery failed: ${errorText}` }).eq("id", notification.data.id);
      return res.status(200).json({ success: false, error: "Low-stock notification was recorded, but email delivery failed." });
    }
  } catch (error: any) {
    console.error("[low-stock-alert] handler failed:", error);
    return res.status(500).json({ success: false, error: "Could not process the low-stock alert." });
  }
}
