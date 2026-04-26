/**
 * delete-account — Supabase Edge Function (CP8.5)
 *
 * App Store guideline 5.1.1(v) requires a *full* account deletion path,
 * not just data deletion. The client (sync.ts → requestAccountDeletion)
 * already wipes user-owned rows; this function nukes the auth.users row
 * itself, which can only be done with the service-role key.
 *
 * Flow:
 *   App (Supabase JWT) → this function → admin-delete user → 204
 *
 * The function:
 *   1. Validates the caller is an authenticated Synapse user
 *   2. Pulls user.id from the JWT (NOT from the request body — the body
 *      can lie; the JWT cannot)
 *   3. Calls auth.admin.deleteUser(user.id) using the service-role key
 *   4. Cascades through `on delete cascade` foreign keys to clean up
 *      anything the client wipe missed
 *
 * Deploy:
 *   supabase functions deploy delete-account
 *
 * Required secrets (set via `supabase secrets set ...`):
 *   SUPABASE_URL              — your project URL
 *   SUPABASE_ANON_KEY         — public anon key (used to verify caller's JWT)
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (NEVER ship to client)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')               ?? '';
const SUPABASE_ANON         = Deno.env.get('SUPABASE_ANON_KEY')          ?? '';
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ── 1. Authenticate the caller via their JWT ──────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse(401, 'Missing Authorization header');

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) return errorResponse(401, 'Invalid or expired session');

    // ── 2. Admin-delete the auth.users row ────────────────────────────────
    // Using the service role key — bypasses RLS, has admin scope.
    if (!SUPABASE_SERVICE_ROLE) return errorResponse(500, 'Service role key not configured');
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return errorResponse(500, `Failed to delete user: ${deleteError.message}`);
    }

    // ── 3. Done ───────────────────────────────────────────────────────────
    // All public.* rows referencing user.id with ON DELETE CASCADE are now
    // gone via FK cascade. The client already nuked them too as a belt-and-
    // braces measure. Auth row is gone. The user is fully scrubbed.
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return errorResponse(500, `Delete error: ${String(err)}`);
  }
});

function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { type: 'delete_account_error', message } }),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
}
