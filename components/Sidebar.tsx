"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Package,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { getStoredAppUser, signOut } from "@/lib/authRoles";
import { BrandMark } from "@/components/ui/BrandMark";

type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: { href: string; label: string }[];
};

export const navigationItems: NavGroup[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [{ href: "/dashboard", label: "Resumen" }],
  },
  {
    label: "Productos",
    icon: Package,
    items: [
      { href: "/productos/nuevo", label: "Nuevo producto" },
      { href: "/productos", label: "Listado" },
      { href: "/productos/mantenimiento", label: "Mantenimiento" },
      { href: "/productos/importar", label: "Importar productos" },
    ],
  },
  {
    label: "Ventas",
    icon: ShoppingCart,
    items: [
      { href: "/pedidos/nuevo", label: "Nueva venta" },
      { href: "/pedidos", label: "Lista pedidos" },
      { href: "/preparacion", label: "Preparacion" },
    ],
  },
  {
    label: "Almacenes",
    icon: Warehouse,
    items: [
      { href: "/almacen/agregar-stock", label: "Agregar stock" },
      { href: "/almacen/ajustes", label: "Corregir / Ajustar stock" },
      { href: "/almacen/transferencias", label: "Transferencias" },
      { href: "/almacen/abastecimiento", label: "Abastecimiento" },
      { href: "/almacen/productos", label: "Productos Almacén" },
      { href: "/almacen/vencimientos", label: "Vencimientos" },
    ],
  },
  {
    label: "Clientes",
    icon: Users,
    items: [{ href: "/clientes", label: "Clientes" }],
  },
  {
    label: "Proveedores",
    icon: Truck,
    items: [
      { href: "/proveedores?tab=listado", label: "Listado proveedores" },
      { href: "/proveedores?tab=compras", label: "Compras y pagos" },
    ],
  },
  {
    label: "Personal",
    icon: UserCog,
    items: [
      { href: "/personal?tab=listado", label: "Listado personal" },
      { href: "/personal?tab=pago", label: "Pago semanal" },
    ],
  },
];

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<{
    nombres: string | null;
    apellidos: string | null;
    rol: string;
  } | null>(null);

  useEffect(() => {
    setUser(getStoredAppUser());
  }, [pathname]);

  function handleSignOut() {
    if (typeof window !== "undefined" && !window.confirm("¿Cerrar sesion?")) {
      return;
    }
    signOut();
  }

  function isItemActive(href: string) {
    const [path, query] = href.split("?");
    if (query) {
      const params = new URLSearchParams(query);
      return pathname === path && params.get("tab") === searchParams.get("tab");
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <aside className="flex h-full w-72 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <Link href="/dashboard" onClick={onNavigate} className="block">
          <BrandMark />
        </Link>
        <p className="mt-2 text-xs text-slate-500">Panel administrativo</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navigationItems
          .filter((group) => {
            // El modulo Personal solo lo ve el admin. Cada trabajador ve su
            // info en /mis-datos desde el dashboard.
            if (group.label === "Personal" && user?.rol !== "admin") {
              return false;
            }
            return true;
          })
          .map((group) => (
          <div key={group.label}>
            <p className="flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <group.icon className="h-3.5 w-3.5 text-halo-600" aria-hidden="true" />
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const isActive = isItemActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-santa-50 text-santa-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3">
        <a
          href={"/manual.html?role=" + getUserRole()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-santa-50 hover:text-santa-800"
        >
          <HelpCircle className="h-4 w-4" aria-hidden="true" />
          <span>Ayuda</span>
          <span className="ml-auto text-[10px] text-slate-400">Manual</span>
        </a>
      </div>

      <div className="border-t border-slate-200 px-3 py-3">
        {user ? (
          <div className="mb-2 px-3 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">
              {[user.nombres, user.apellidos].filter(Boolean).join(" ") || "Usuario"}
            </p>
            <p className="capitalize">{user.rol}</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>Cerrar sesion</span>
        </button>
      </div>
    </aside>
  );
}

function getUserRole(): "admin" | "trabajador" | "cliente" {
  if (typeof window === "undefined") return "trabajador";
  try {
    const raw = window.localStorage.getItem("app_minimarket_user");
    if (!raw) return "trabajador";
    const parsed = JSON.parse(raw) as { rol?: string };
    if (parsed?.rol === "admin" || parsed?.rol === "trabajador" || parsed?.rol === "cliente") {
      return parsed.rol;
    }
    return "trabajador";
  } catch {
    return "trabajador";
  }
}
