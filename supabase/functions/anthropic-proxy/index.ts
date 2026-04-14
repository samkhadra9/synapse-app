/**
 * anthropic-proxy — Supabase Edge Function
 *
 * Acts as a thin authenticated proxy between the Synapse app and the
 * Anthropic API. The API key lives here in Supabase Vault — it never
 * touches the app binary.
 *
 * Flow:
 *   App (with Supabase JWT) → this function → Anthropic → response → App
 *
 * The function:
 *   1. Validates the caller is an authenticated Synapse user
 *   2. Forwards the request body verbatim to Anthropic
 *   3. Returns Anthropic's response verbatim
 *
 * Deploy:
 *   supabase functions deploy anthropic-proxy --no-verify-jwt
 *
 * Set secret:
 *   supabase secrets set ANTHROPIC_KEY=sk-ant-...
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_KEY  = Deno.env.get('ANTHROPIC_KEY')       ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')         ?? '';
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY')    ?? '';

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
    // ── 1. Authenticate ────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(401, 'Missing Authorization header');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse(401, 'Invalid or expired session');
    }

    // ── 2. Forward to Anthropic ────────────────────────────────────────────
    const body = await req.text();

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    const responseText = await anthropicRes.text();

    return new Response(responseText, {
      status:  anthropicRes.status,
      headers: {
        ...CORS,
        'Content-Type': anthropicRes.headers.get('Content-Type') ?? 'application/json',
      },
    });

  } catch (err) {
    return errorResponse(500, `Proxy error: ${String(err)}`);
  }
});

function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { type: 'proxy_error', message } }),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
}
