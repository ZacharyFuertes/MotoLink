/**
 * Vercel Serverless Function — reports whether the PayMongo provider is
 * configured so the UI can disable online payment without knowing the secret.
 *
 * Returns a boolean only (never the key). If this returns false, no QR should
 * be generated / rendered anywhere.
 */

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ providerConfigured: false });
  }
  return res.status(200).json({
    providerConfigured: Boolean(process.env.PAYMONGO_SECRET_KEY),
  });
}