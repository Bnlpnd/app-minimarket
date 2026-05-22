import { AlmacenMovimientos } from "@/components/AlmacenMovimientos";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function MovimientosAlmacenPage() {
  return (
    <Layout
      title="Movimientos de stock"
      description="Historial de ingresos, salidas, ajustes y transferencias."
    >
      <AlmacenMovimientos />
    </Layout>
  );
}
