/**
 * Vercel Serverless Function — Send login verification code via Gmail SMTP
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME || "MotoLink";
const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_APP_PASS = (process.env.GMAIL_APP_PASS || "").replace(/\s+/g, "");

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_15_MIN = 3;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const hashCode = (userId: string, code: string): string =>
  createHash("sha256")
    .update(`${userId}:${code}`)
    .digest("hex");

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ success: false, error: "Server not configured." });
    }

    const gmailReady = Boolean(GMAIL_USER && GMAIL_APP_PASS);
    const sendgridReady = Boolean(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL);
    if (!gmailReady && !sendgridReady) {
      console.error("No email transport configured for login verification");
      return res
        .status(500)
        .json({
          success: false,
          error:
            "Email service not configured: set GMAIL_USER/GMAIL_APP_PASS or SENDGRID_API_KEY/SENDGRID_FROM_EMAIL on the server.",
        });
    }

    const { email, password } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, error: "Email is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find user by email
    const { data: user, error: userError } = await db
      .from("users")
      .select("id, email, name, role")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({ success: false, error: "No account found with this email." });
    }
    if (user.role !== "customer") {
      return res.status(403).json({ success: false, error: "Please use the sign-in portal for your account." });
    }

    // Password login uses a non-persistent server-side Supabase client to
    // validate credentials. No browser session is created until OTP succeeds.
    if (password !== undefined) {
      if (typeof password !== "string" || !password) {
        return res.status(400).json({ success: false, error: "Email and password are required." });
      }
      if (!SUPABASE_ANON_KEY) {
        return res.status(500).json({ success: false, error: "Server not configured." });
      }

      const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: authData, error: authError } = await auth.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError || authData?.user?.id !== user.id) {
        return res.status(401).json({ success: false, error: "Invalid email or password." });
      }
    }

    // Rate limit
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count: recentCount } = await db
        .from("verification_codes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("purpose", "login")
        .gte("created_at", fifteenMinAgo);

      if (recentCount && recentCount >= MAX_REQUESTS_PER_15_MIN) {
        return res.status(429).json({
          success: false,
          error: "Too many code requests. Please try again in 15 minutes.",
        });
      }

      // Invalidate old codes
      await db
        .from("verification_codes")
        .update({ used: true })
        .eq("user_id", user.id)
        .eq("purpose", "login")
        .eq("used", false);
    } catch (e) {
      console.error("Rate limit check failed:", e);
      // Continue anyway if table doesn't exist yet
    }

    // Generate code
    const code = generateCode();
    const codeHash = hashCode(user.id, code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    try {
      const { error: insertError } = await db.from("verification_codes").insert({
        user_id: user.id,
        email: normalizedEmail,
        code: codeHash,
        code_hash: codeHash,
        purpose: "login",
        expires_at: expiresAt,
        used: false,
        attempts: 0,
      });

      if (insertError) {
        console.error("[send-login-otp] failed to store code:", insertError);
        // Try without code_hash if column doesn't exist
        const { error: insertError2 } = await db.from("verification_codes").insert({
          user_id: user.id,
          email: normalizedEmail,
          code: codeHash,
          purpose: "login",
          expires_at: expiresAt,
          used: false,
          attempts: 0,
        });
        if (insertError2) {
          console.error("[send-login-otp] failed to store code (fallback):", insertError2);
          return res.status(500).json({ success: false, error: "Failed to generate code. Database not ready." });
        }
      }
    } catch (e) {
      console.error("[send-login-otp] insert exception:", e);
      return res.status(500).json({ success: false, error: "Failed to generate code." });
    }

    // Send email
    const firstName = user.name?.split(" ")[0] || "there";
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>MotoLink Login Code</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-top:3px solid #0f172a;max-width:600px;width:100%;">
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background:#0f172a;width:36px;height:36px;border-radius:4px;text-align:center;line-height:36px;font-size:20px;font-weight:900;color:#fff;vertical-align:middle;">M</div>
                    <span style="margin-left:10px;font-size:18px;font-weight:900;color:#0f172a;letter-spacing:2px;vertical-align:middle;">MOTOLINK</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px 0;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:900;color:#0f172a;">Your Login Verification Code</h1>
              <p style="margin:0;font-size:15px;color:#64748b;line-height:1.6;">Hi ${escapeHtml(firstName)}, use this code to sign in to your MotoLink account.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;text-align:center;">
              <div style="background:#f8fafc;border:2px solid #e2e8f0;border-radius:12px;padding:24px;display:inline-block;">
                <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#0f172a;font-family:'Courier New',monospace;">${code}</div>
              </div>
              <p style="margin:16px 0 0;font-size:13px;color:#64748b;">This code expires in <strong>10 minutes</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 36px 32px;">
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;">
                <p style="margin:0;font-size:12px;color:#991b1b;line-height:1.6;">If you didn't request this code, please ignore this email.</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f8fafc;background:#0a0a0a;">
              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.8;">
                MotoLink &nbsp;•&nbsp; Professional Vehicle Service<br/>
                <span style="color:#94a3b8;">This is an automated notification.</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `MOTOLINK - Login Verification Code\n\nHi ${firstName},\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`;

    try {
      if (gmailReady) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: GMAIL_USER,
            pass: GMAIL_APP_PASS,
          },
        });
        await transporter.sendMail({
          from: `"MotoLink" <${GMAIL_USER}>`,
          to: normalizedEmail,
          subject: `Your MotoLink Login Code: ${code}`,
          html,
          text,
        });
      } else {
        sgMail.setApiKey(SENDGRID_API_KEY);
        await sgMail.send({
          to: normalizedEmail,
          from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
          subject: `Your MotoLink Login Code: ${code}`,
          html,
          text,
        });
      }
    } catch (e: any) {
      console.error("[send-login-otp] send exception:", e);
      return res.status(500).json({ success: false, error: e?.message || "Failed to send verification code." });
    }

    console.log(`[send-login-otp] code sent to ${normalizedEmail} (user ${user.id})`);
    return res.status(200).json({ success: true, message: "Verification code sent to your email." });
  } catch (err: any) {
    console.error("[send-login-otp] error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Something went wrong." });
  }
}
