import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { loginPath } from "./auth-paths";
import { getCurrentPerson } from "./db";
import { createServerSupabase } from "./supabase/server";
import type { Person } from "./types";

export async function getAuthUser(): Promise<User | null> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * Guard for the signed-in board. The middleware redirects visitors without a
 * session first; these keep a page or route handler from ever serving thanks
 * if that ever stops being true.
 */
export async function requireAuthUser(next?: string): Promise<User> {
  const user = await getAuthUser();
  if (!user) redirect(loginPath(next));
  return user;
}

export async function requireCurrentPerson(next?: string): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) redirect(loginPath(next));
  return person;
}
