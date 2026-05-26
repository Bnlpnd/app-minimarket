export type AppRole = "admin" | "trabajador" | "cliente" | string;

export type CurrentUserProfile = {
  id: string;
  email: string | null;
  nombres: string | null;
  apellidos: string | null;
  activo: boolean;
  roles: {
    nombre: AppRole;
  } | null;
};

export function getStoredAppUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem("app_minimarket_user");
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as {
      id: string;
      email: string;
      rol: string;
      nombres: string | null;
      apellidos: string | null;
    };
  } catch {
    window.localStorage.removeItem("app_minimarket_user");
    return null;
  }
}

export async function getCurrentUserProfile() {
  const session = getStoredAppUser();

  if (!session) {
    return { profile: null, error: null };
  }

  return {
    profile: {
      id: session.id,
      email: session.email,
      nombres: session.nombres,
      apellidos: session.apellidos,
      activo: true,
      roles: { nombre: session.rol },
    } satisfies CurrentUserProfile,
    error: null,
  };
}

export function isAdmin(profile: CurrentUserProfile | null) {
  return profile?.activo === true && profile.roles?.nombre === "admin";
}

export function isTrabajador(profile: CurrentUserProfile | null) {
  return profile?.activo === true && profile.roles?.nombre === "trabajador";
}

/**
 * Cierra la sesion: borra la session local y redirige al login.
 */
export function signOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("app_minimarket_user");
  window.location.href = "/login";
}
