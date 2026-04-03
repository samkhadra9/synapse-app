/**
 * Supabase client — configured with expo-secure-store for token persistence
 *
 * Usage:
 *   import { supabase } from '../lib/supabase';
 */

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ── SecureStore adapter with chunking ─────────────────────────────────────────
// SecureStore has a 2048-byte limit per key. Supabase session tokens exceed
// this, so we split large values into 1800-byte chunks and reassemble on read.

const CHUNK_SIZE = 1800;

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return null;
    try {
      // Check if this value was stored in chunks
      const chunkCount = await SecureStore.getItemAsync(`${key}_numChunks`);
      if (chunkCount) {
        const count = parseInt(chunkCount, 10);
        let value = '';
        for (let i = 0; i < count; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
          if (chunk === null) return null;
          value += chunk;
        }
        return value;
      }
      // Fall back to direct storage for small values
      return SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') return;
    try {
      if (value.length <= CHUNK_SIZE) {
        // Small enough — store directly, clean up any old chunks
        await SecureStore.deleteItemAsync(`${key}_numChunks`).catch(() => {});
        await SecureStore.setItemAsync(key, value);
        return;
      }
      // Split into chunks
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunks[i]);
      }
      await SecureStore.setItemAsync(`${key}_numChunks`, String(chunks.length));
      // Remove the old direct key if it existed
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch (e) {
      console.warn('[SecureStore] setItem failed:', e);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') return;
    try {
      const chunkCount = await SecureStore.getItemAsync(`${key}_numChunks`);
      if (chunkCount) {
        const count = parseInt(chunkCount, 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${key}_numChunks`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {
      // silent
    }
  },
};

// ── Environment variables ─────────────────────────────────────────────────────
// Set these in your .env file (Expo reads EXPO_PUBLIC_* vars at build time):
//   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

const supabaseUrl  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || !supabaseAnon)) {
  console.warn(
    '[Supabase] Missing env vars — create .env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

// ── Client ────────────────────────────────────────────────────────────────────

export const supabase = createClient(supabaseUrl, supabaseAnon, {
  auth: {
    storage:            ExpoSecureStoreAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false, // not a web app
  },
});
