"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const navigationItems = [
  {
    label: "Dashboard",
    items: [{ href: "/dashboard", label: "Resumen" }],
  },
  {
    label: "Productos",
    items: [
      { href: "/productos", label: "Listado" },
      { href: "/productos/nuevo", label: "Nuevo producto" },
      { href: "/productos/importar", label: "Importar CSV" },
      { href: "/productos/mantenimiento", label: "Mantenimiento" },
    ],
  },
  {
    label: "Almacen",
    items: [
      { href: "/almacen", label: "Stock" },
      { href: "/almacen/movimientos", label: "Movimientos" },
      { href: "/almacen/transferencias", label: "Transferencias" },
      { href: "/almacen/ajustes", label: "Ajustes" },
    ],
  },
  {
    label: "Ventas / Pedidos",
    items: [
      { href: "/pedidos/nuevo", label: "Nueva venta" },
      { href: "/pedidos", label: "Pedidos" },
      { href: "/preparacion", label: "Preparacion" },
    ],
  },
  {
    label: "Clientes",
    items: [{ href: "/clientes", label: "Clientes" }],
  },
  {
    label: "Pagos",
    items: [{ href: "/pagos", label: "Validar Yape" }],
  },
];

type SidebarProps = {
  onNavigate?: () => void;
};

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-72 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="block text-lg font-semibold tracking-tight text-slate-950"
        >
          Minimarket Santa Ana
        </Link>
        <p className="mt-1 text-sm text-slate-500">Panel administrativo</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navigationItems.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-800"
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

      <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
        Version inicial
      </div>
    </aside>
  );
}
