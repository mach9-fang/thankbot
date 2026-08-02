"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicKey, supabaseUrl } from "./env";

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublicKey());
}
