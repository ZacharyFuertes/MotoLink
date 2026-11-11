import { supabase } from "./supabaseClient";

export type AuthenticatedPostResult =
  | { response: Response; body: any; error?: never }
  | { response: null; body: null; error: string };

/**
 * POST to a server endpoint with the current Supabase access token. If the
 * server rejects a stale token, refresh the session and retry exactly once.
 */
export const postAuthenticatedJson = async (
  url: string,
  payload: Record<string, unknown>,
): Promise<AuthenticatedPostResult> => {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
    }
    if (!session?.access_token) return { response: null, body: null, error: "Not signed in. Please sign in again." };

    const post = async (accessToken: string) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, accessToken }),
      });
      const body = await response.json().catch(() => null);
      return { response, body };
    };

    const first = await post(session.access_token);
    if (first.response.status !== 401) return first;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const freshToken = refreshed.session?.access_token;
    if (refreshError || !freshToken || freshToken === session.access_token) {
      return {
        ...first,
        body: {
          ...(first.body && typeof first.body === "object" ? first.body : {}),
          error: "Your sign-in session could not be verified. Sign out and sign in again, then retry.",
        },
      };
    }

    return post(freshToken);
  } catch (error) {
    return {
      response: null,
      body: null,
      error: error instanceof Error ? error.message : "Network error requesting the server endpoint.",
    };
  }
};
