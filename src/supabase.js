import { createClient } from "@supabase/supabase-js";

// Shared HCVA project (same one DeviceCare uses).
// Use the publishable key (sb_publishable_...). Never put the secret key in this app.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const sb = configured
  ? createClient(url, key, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, storageKey: "hcva-ats-auth" },
    })
  : null;
