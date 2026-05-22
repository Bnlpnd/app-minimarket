import { AlmacenDashboard } from "@/components/AlmacenDashboard";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function AlmacenPage() {
  return (
    <Layout
      title="Almacen"
      description="Stock por ubicacion, costos referenciales y alertas operativas."
    >
      <AlmacenDashboard />
    </Layout>
  );
}
