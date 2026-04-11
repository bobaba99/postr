/**
 * delete-account — Supabase Edge Function
 *
 * Permanently deletes the authenticated user from auth.users.
 * This is the only way to fully remove a user — the client SDK
 * can only sign out (clear session), not delete the auth record.
 *
 * The client calls this BEFORE signing out:
 *   1. Delete all posters (client-side, RLS-protected)
 *   2. Call this function (deletes public.users + auth.users)
 *   3. Sign out + clear localStorage
 *
 * Security: only the authenticated user can delete themselves.
 * The function extracts user ID from the JWT — no user ID param
 * needed, preventing IDOR attacks.
 *
 * Deploy: supabase functions deploy delete-account
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract the user's JWT from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create a client with the user's JWT to get their ID
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Use the service role client to delete the user from auth.users
    // This cascades through ON DELETE CASCADE FKs (public.users, posters, etc.)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: `Failed to delete user: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
