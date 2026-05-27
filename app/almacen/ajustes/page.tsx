import { Suspense } from "react";
import { AlmacenAjustes } from "@/components/AlmacenAjustes";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function AjustesAlmacenPage() {
  return (
    <Layout
      title="Corregir / Ajustar stock"
      description="Corrige el stock real contado y queda registrado como ajuste en el historial."
    >
      <Suspense fallback={<p className="text-sm text-slate-500">Cargando...</p>}>
        <AlmacenAjustes />
      </Suspense>
    </Layout>
  );
}
