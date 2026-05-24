import { AlmacenAjustes } from "@/components/AlmacenAjustes";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function AjustesAlmacenPage() {
  return (
    <Layout
      title="Ajustes de inventario"
      description="Corrige stock segun conteo fisico y registra el movimiento."
    >
      <AlmacenAjustes />
    </Layout>
  );
}
