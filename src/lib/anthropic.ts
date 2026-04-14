/**
 * anthropic.ts — Synapse Anthropic call helper
 *
 * Routes every Anthropic call through the Supabase Edge Function proxy so
 * the API key never lives in the app binary.
 *
 * If a user has entered their own personal Anthropic key in Settings it is
 * used directly (their key, their bill) — the proxy is only used when no
 * personal key is set.
 */

import { supabase } from './supabase';

const PROXY_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/anthropic-proxy`;

/**
 * Make an Anthropic /v1/messages call.
 *
 * @param body      - Full Anthropic request body (model, messages, system, etc.)
 * @param userKey   - Optional personal API key. If provided, calls Anthropic
 *                    directly. If omitted, calls via the secure server proxy.
 */
export async function fetchAnthropic(
  body: object,
  userKey?: string,
): Promise<Response> {
  if (userKey) {
    // Power-user path: their own key, direct call
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         userKey,
        'anthropic-version': '2024-06-01',
      },
      body: JSON.stringify(body),
    });
  }

  // Default path: proxy — key stays server-side
  let { data: { session } } = await supabase.auth.getSession();

  // If the stored session is expired or missing, attempt a silent refresh
  if (!session?.access_token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session;
  }

  return fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  });
}
