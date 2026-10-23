import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createDispatchHandler } from './core.mjs';

const client = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });

Deno.serve(createDispatchHandler({
  db: client,
  workerToken: Deno.env.get('FREO_AUTOMATION_WORKER_TOKEN') || '',
  webhookUrl: Deno.env.get('FREO_AUTOMATION_WEBHOOK_URL') || '',
  signingSecret: Deno.env.get('FREO_AUTOMATION_WEBHOOK_SECRET') || '',
}));
