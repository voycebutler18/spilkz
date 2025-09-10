// src/integrations/supabase/client.ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "https://izeheflwfguwinizihmx.supabase.co";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

type SB = ReturnType<typeof createClient>;

// Reuse the same instance across HMR/module reloads
declare global {
  // eslint-disable-next-line no-var
  var __sb__: SB | undefined;
}

export const supabase: SB =
  globalThis.__sb__ ??
  createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (!globalThis.__sb__) globalThis.__sb__ = supabase;
