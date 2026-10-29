/** Notify a shop owner by email after an admin approves their shop. */
import { createClient } from "@supabase/supabase-js";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "MotoLink";
const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASS || "").replace(/\s+/g, "");

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: "Email service is not configured." });
  }

  const { shopId, accessToken } = req.body || {};
  if (!shopId || !accessToken) {
    return res.status(400).json({ success: false, error: "Shop and admin session are required." });
  }

  try {
    const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: authError } = await auth.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      return res.status(401).json({ success: false, error: "Session is invalid." });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: admin, error: adminError } = await db
      .from("users")
      .select("id, role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (adminError || admin?.role !== "admin") {
      return res.status(403).json({ success: false, error: "Admins only." });
    }

    const { data: shop, error: shopError } = await db
      .from("shops")
      // is_active is the schema-compatible approval indicator. Some deployed
      // databases do not have the newer lifecycle status column yet.
      .select("id, name, is_active, owner_id, email")
      .eq("id", shopId)
      .maybeSingle();
    if (shopError) {
      console.error("[send-shop-approved] shop lookup failed:", shopError);
      return res.status(500).json({ success: false, error: "Could not load approved shop." });
    }
    if (!shop) {
      return res.status(404).json({ success: false, error: "Shop not found." });
    }
    if (!shop.is_active) {
      return res.status(409).json({ success: false, error: "Shop is not approved yet." });
    }

    let owner: { email?: string | null; name?: string | null } | null = null;
    if (shop.owner_id) {
      const { data: ownerData, error: ownerError } = await db
        .from("users")
        .select("email, name")
        .eq("id", shop.owner_id)
        .maybeSingle();
      if (ownerError) {
        console.error("[send-shop-approved] owner lookup failed:", ownerError);
      } else {
        owner = ownerData;
      }
    }

    const recipientEmail = owner?.email || shop.email;
    if (!recipientEmail) {
      return res.status(404).json({ success: false, error: "Shop owner email was not found." });
    }

    const gmailReady = Boolean(GMAIL_USER && GMAIL_APP_PASS);
    const sendgridReady = Boolean(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL);
    if (!gmailReady && !sendgridReady) {
      return res.status(503).json({ success: false, error: "No email provider is configured." });
    }

    const ownerName = owner?.name?.trim() || "Shop Owner";
    const name = escapeHtml(ownerName);
    const shopName = escapeHtml(shop.name);
    const subject = `Your shop has been approved – ${shop.name} | MotoLink`;
    const text = `Hi ${ownerName},\n\nGood news! ${shop.name} has been approved on MotoLink. You can now sign in to access your shop dashboard and manage your business.\n\nThank you for joining MotoLink.`;
    const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" style="max-width:600px;width:100%;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px"><tr><td style="padding:28px 32px;background:#0f172a;color:#fff;border-radius:12px 12px 0 0;font-weight:800;letter-spacing:2px">MOTOLINK</td></tr><tr><td style="padding:32px"><p style="margin:0 0 12px;color:#475569">Hi ${name},</p><h1 style="margin:0 0 16px;font-size:24px">Your shop is approved!</h1><p style="color:#334155;line-height:1.6"><strong>${shopName}</strong> has been approved and is now live on MotoLink. You can sign in to access your shop dashboard and manage your business.</p><p style="margin:28px 0 0;color:#64748b;font-size:13px">Thank you for joining MotoLink.</p></td></tr><tr><td style="padding:18px 32px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;text-align:center">Automated notification from MotoLink</td></tr></table></body></html>`;

    if (gmailReady) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASS },
      });
      await transporter.sendMail({
        from: `"${SENDGRID_FROM_NAME}" <${GMAIL_USER}>`,
        to: recipientEmail,
        subject,
        text,
        html,
      });
    } else {
      sgMail.setApiKey(SENDGRID_API_KEY);
      await sgMail.send({
        to: recipientEmail,
        from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
        subject,
        text,
        html,
      });
    }

    console.log(`[send-shop-approved] Email sent for ${shop.id} to ${recipientEmail}`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("[send-shop-approved] failed:", error?.message || error);
    return res.status(500).json({ success: false, error: "Could not send the approval email." });
  }
}
