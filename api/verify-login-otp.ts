/**
 * Vercel Serverless Function Verify login OTP code
 *
 * Flow:
 *  1. Look up the stored (hashed) code for the user and check it is unused,
 *     unexpired and under the attempt limit.
 *  2. Burn the code so it can never be replayed.
 *  3. Mint a Supabase session with the admin "magiclink" link generator and
 *     redeem the one-time token hash for a real user session.
 *
 * The browser never receives SMTP credentials or the service-role key.
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

/** Codes are stored hashed so a leaked table cannot be brute-forced offline. */
export const hashCode = (userId: string, code: string): string =>
  createHash("sha256")
    .update(`${userId}:${code}`)
    .digest("hex");

const MAX_ATTEMPTS = 5;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed." });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: "Server not configured." });
  }

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ success: false, error: "Email and code are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedCode = String(code).trim();

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1) Resolve the account.
    const { data: user, error: userError } = await db
      .from("users")
      .select("id, email, role")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({ success: false, error: "Invalid credentials." });
    }

    // 2) Find the newest unused, unexpired code for this user.
    const { data: candidates, error: codeError } = await db
      .from("verification_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("purpose", "login")
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(3);

    if (codeError) {
      console.error("[verify-login-otp] code lookup failed:", codeError);
      return res.status(500).json({ success: false, error: "Could not verify the code." });
    }

    const rows = candidates || [];
    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: "Invalid or expired code." });
    }

    // Locked out after too many failed attempts on the newest code.
    const newest = rows[0];
    if ((newest.attempts || 0) >= MAX_ATTEMPTS) {
      await db.from("verification_codes").update({ used: true }).eq("id", newest.id);
      return res.status(429).json({
        success: false,
        error: "Too many failed attempts. Please request a new code.",
      });
    }

    const expectedHash = hashCode(user.id, normalizedCode);
    const match = rows.find(
      (row: any) =>
        ((row.code_hash || row.code) === expectedHash || (row.code === normalizedCode)) &&
        new Date(row.expires_at).getTime() > Date.now(),
    );

    if (!match) {
      // Wrong code: count the attempt against the newest live code.
      await db
        .from("verification_codes")
        .update({ attempts: (newest.attempts || 0) + 1 })
        .eq("id", newest.id);
      return res.status(401).json({ success: false, error: "Invalid or expired code." });
    }

    // 3) Burn the code so it cannot be replayed.
    await db
      .from("verification_codes")
      .update({ used: true })
      .eq("id", match.id);

    // 4) Mint a session. generateLink does NOT send an email it only creates
    //    a one-time token hash which we redeem immediately for a session.
    const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[verify-login-otp] generateLink failed:", linkError);
      return res.status(500).json({ success: false, error: "Could not create a session." });
    }

    const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: sessionData, error: sessionError } = await auth.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (sessionError || !sessionData?.session) {
      console.error("[verify-login-otp] verifyOtp failed:", sessionError);
      return res.status(500).json({ success: false, error: "Could not create a session." });
    }

    console.log(`[verify-login-otp] User ${user.id} authenticated via email code`);

    return res.status(200).json({
      success: true,
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: sessionData.session.expires_at,
      },
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error("[verify-login-otp] Error:", err);
    return res.status(500).json({ success: false, error: "Something went wrong." });
  }
}
