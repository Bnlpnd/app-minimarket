import { Suspense } from "react";
import { AlmacenAgregarStock } from "@/components/AlmacenAgregarStock";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function AgregarStockPage() {
  return (
    <Layout
      title="Agregar stock"
      description="Actualiza stock por almacen o registra ingresos segun presentacion."
    >
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
        <AlmacenAgregarStock />
      </Suspense>
    </Layout>
  );
}
