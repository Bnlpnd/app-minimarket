"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Layout } from "@/components/Layout";
import { ProveedoresModule } from "@/components/ProveedoresModule";
import { ProveedorComprasModule } from "@/components/ProveedorComprasModule";

export const dynamic = "force-dynamic";

function ProveedoresPageInner() {
  const params = useSearchParams();
  const tab = params.get("tab") === "compras" ? "compras" : "listado";

  return (
    <Layout
      title="Proveedores"
      description={
        tab === "compras"
          ? "Registra boletas, pagos y deudas con tus proveedores."
          : "Registra distribuidores y contactos para comparar costos por producto."
      }
    >
      <nav className="mb-4 flex gap-2 border-b border-slate-200">
        <TabLink href="/proveedores?tab=listado" active={tab === "listado"}>
          Listado
        </TabLink>
        <TabLink href="/proveedores?tab=compras" active={tab === "compras"}>
          Compras y pagos
        </TabLink>
      </nav>

      {tab === "compras" ? <ProveedorComprasModule /> : <ProveedoresModule />}
    </Layout>
  );
}

export default function ProveedoresPage() {
  return (
    <Suspense fallback={null}>
      <ProveedoresPageInner />
    </Suspense>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative -mb-px inline-flex h-10 items-center border-b-2 px-4 text-sm font-medium ${
        active
          ? "border-santa-600 text-santa-700"
          : "border-transparent text-slate-600 hover:text-slate-900"
      }`}
    >
      {children}
    </Link>
  );
}
