import { AlmacenVencimientos } from "@/components/AlmacenVencimientos";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function VencimientosPage() {
  return (
    <Layout
      title="Vencimientos"
      description="Lotes con fecha de vencimiento. Resta del stock al descartar."
    >
      <AlmacenVencimientos />
    </Layout>
  );
}
