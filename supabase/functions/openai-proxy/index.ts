/**
 * openai-proxy — Supabase Edge Function
 *
 * Proxies Whisper (audio transcription) calls to OpenAI so the API key
 * never lives in the app binary.
 *
 * Flow:
 *   App (multipart audio + Supabase JWT) → this function → OpenAI Whisper → transcript → App
 *
 * Deploy:
 *   supabase functions deploy openai-proxy --no-verify-jwt
 *
 * Set secret:
 *   supabase secrets set OPENAI_KEY=sk-proj-...
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_KEY   = Deno.env.get('OPENAI_KEY')        ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')       ?? '';
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
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

    // ── 2. Forward multipart form data to OpenAI Whisper ───────────────────
    const formData = await req.formData();

    const openaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        // Do NOT set Content-Type here — fetch sets it automatically with
        // the correct multipart boundary when given a FormData body.
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: formData,
    });

    const responseText = await openaiRes.text();

    return new Response(responseText, {
      status: openaiRes.status,
      headers: {
        ...CORS,
        'Content-Type': openaiRes.headers.get('Content-Type') ?? 'application/json',
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
