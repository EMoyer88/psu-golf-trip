import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // This only throws in the browser at runtime if env vars are missing,
  // which is exactly when you want a loud error rather than a silent blank app.
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Set these in Vercel > Project Settings > Environment Variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
