import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createApiHandler } from './core.mjs';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const client = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(createApiHandler({
  db: client,
  readToken: Deno.env.get('FREO_API_READ_TOKEN') || '',
  writeToken: Deno.env.get('FREO_API_WRITE_TOKEN') || '',
  storageOrigin: url.replace(/\/$/, ''),
}));
