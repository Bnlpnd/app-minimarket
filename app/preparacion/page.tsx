import { Suspense } from "react";
import { Layout } from "@/components/Layout";
import { PreparacionModule } from "@/components/PreparacionModule";

export default function PreparacionPage() {
  return (
    <Layout
      title="Preparacion"
      description="Organiza pedidos, descuenta stock al iniciar preparacion y completa el checklist."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Cargando preparacion...</div>}>
        <PreparacionModule />
      </Suspense>
    </Layout>
  );
}
