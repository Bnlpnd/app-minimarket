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

export type StoredAppUser = {
  id: string;
  email: string;
  rol: string;
  nombres: string | null;
  apellidos: string | null;
  /** Para clientes: ficha de cliente vinculada (pedidos/deudas/pagos). */
  cliente_id?: string | null;
};

const SESSION_KEY = "app_minimarket_user";

export function getStoredAppUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as StoredAppUser;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/** Guarda la sesion local (usada por login staff y login de cliente). */
export function setStoredAppUser(user: StoredAppUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/** Roles que pueden entrar al panel administrativo/operativo. */
export function isStaffRole(rol: string | null | undefined) {
  return rol === "admin" || rol === "trabajador";
}

export function isCliente(profile: CurrentUserProfile | null) {
  return profile?.roles?.nombre === "cliente";
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
 * Cierra la sesion: borra la session local (y la de Supabase Auth si la
 * hubiera, para clientes con Google) y vuelve a la tienda.
 */
export function signOut(redirectTo: string = "/") {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  import("@/lib/supabaseClient")
    .then(({ supabase }) => supabase?.auth.signOut())
    .catch(() => {})
    .finally(() => {
      window.location.href = redirectTo;
    });
}
