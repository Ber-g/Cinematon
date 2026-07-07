import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Client Supabase de la Kiosk. Configuré via variables Vite (préfixe VITE_).
// Sans config (.env absent) → `null` : la Kiosk retombe sur le catalogue factice et
// des sessions en mémoire (parcours testable hors ligne, comme avant).
// Clé anon PUBLIQUE par nature ; l'isolation vient de la RLS (la Kiosk s'authentifie
// avec un compte-device membre de l'organisation — voir backend.ts).

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
