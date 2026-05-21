"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const navigationItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/productos", label: "Productos" },
  { href: "/clientes", label: "Clientes" },
  { href: "/pedidos", label: "Pedidos" },
  { href: "/pagos", label: "Pagos" },
  { href: "/preparacion", label: "Preparacion" },
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

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
        Version inicial
      </div>
    </aside>
  );
}
