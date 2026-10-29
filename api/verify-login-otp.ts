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

  const { email, code, purpose = "login", registration } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ success: false, error: "Email and code are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedCode = String(code).trim();
  const runtimePurpose =
    purpose === "shop_signup" || purpose === "customer_signup" ? purpose : "login";

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    let user: { id: string; email: string; role: string } | null = null;

    if (runtimePurpose === "login") {
      // 1) Resolve the account.
      const { data: existingUser, error: userError } = await db
        .from("users")
        .select("id, email, role")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (userError || !existingUser) {
        return res.status(404).json({ success: false, error: "Invalid credentials." });
      }
      user = existingUser;
    }

    // 2) Find the newest unused, unexpired code for this email.
    const { data: candidates, error: codeError } = await db
      .from("verification_codes")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("purpose", runtimePurpose)
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

    const expectedHash = hashCode(user?.id || normalizedEmail, normalizedCode);
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

    if (runtimePurpose === "shop_signup") {
      return res.status(200).json({
        success: true,
        pendingRegistration: true,
      });
    }

    if (runtimePurpose === "customer_signup") {
      const password = typeof registration?.password === "string" ? registration.password : "";
      const name = typeof registration?.name === "string" ? registration.name.trim() : "";
      if (
        password.length < 8 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !name
      ) {
        return res.status(400).json({
          success: false,
          error: "Enter your name and a valid password to finish signup.",
        });
      }

      const { data: created, error: createError } = await db.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });
      if (createError || !created?.user?.id) {
        console.error("[verify-login-otp] customer creation failed:", createError);
        const duplicate = /already|registered|exists/i.test(createError?.message || "");
        return res.status(duplicate ? 409 : 500).json({
          success: false,
          error: duplicate
            ? "This email already has an account. Sign in instead or use the resend code option."
            : "Could not create your account. Please try again.",
        });
      }

      user = { id: created.user.id, email: normalizedEmail, role: "customer" };

      const { error: profileError } = await db.from("users").upsert(
        {
          id: user.id,
          email: normalizedEmail,
          name,
          role: "customer",
          phone: typeof registration.phone === "string" ? registration.phone.trim() || null : null,
          address: typeof registration.address === "string" ? registration.address.trim() || null : null,
          shop_id: null,
        },
        { onConflict: "id" },
      );

      if (profileError) {
        console.error("[verify-login-otp] customer profile creation failed:", profileError);
        await db.auth.admin.deleteUser(user.id);
        return res.status(500).json({ success: false, error: "Could not save your profile. Please try again." });
      }

      const vehicleMake = typeof registration.vehicleMake === "string" ? registration.vehicleMake.trim() : "";
      const vehicleModel = typeof registration.vehicleModel === "string" ? registration.vehicleModel.trim() : "";
      if (vehicleMake && vehicleModel) {
        const { error: vehicleError } = await db.from("vehicles").insert({
          customer_id: user.id,
          make: vehicleMake,
          model: vehicleModel,
        });
        if (vehicleError) {
          console.error("[verify-login-otp] customer vehicle creation failed:", vehicleError);
          await db.auth.admin.deleteUser(user.id);
          return res.status(500).json({ success: false, error: "Could not save your vehicle. Please try again." });
        }
      }
    }

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
