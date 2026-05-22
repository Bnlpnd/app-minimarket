import { supabase, supabaseConfigError } from "@/lib/supabaseClient";

export type AppRole = "admin" | "trabajador" | "cliente" | string;

export type CurrentUserProfile = {
  id: string;
  nombres: string | null;
  apellidos: string | null;
  activo: boolean;
  roles: {
    nombre: AppRole;
  } | null;
};

export async function getCurrentUserProfile() {
  if (supabaseConfigError || !supabase) {
    return {
      profile: null,
      error: supabaseConfigError ?? "No hay conexion a Supabase.",
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (userError && !userError.message.toLowerCase().includes("session")) {
    return { profile: null, error: userError.message };
  }

  if (!userId) {
    return { profile: null, error: null };
  }

  const { data, error } = await supabase
    .from("usuarios_perfil")
    .select("id,nombres,apellidos,activo,roles(nombre)")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return { profile: null, error: error.message };
  }

  return { profile: data as CurrentUserProfile | null, error: null };
}

export function isAdmin(profile: CurrentUserProfile | null) {
  return profile?.activo === true && profile.roles?.nombre === "admin";
}
