import { AlmacenAbastecimiento } from "@/components/AlmacenAbastecimiento";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function AbastecimientoPage() {
  return (
    <Layout
      title="Abastecimiento"
      description="Revisa y ajusta pedidos de reposicion generados desde almacen."
    >
      <AlmacenAbastecimiento />
    </Layout>
  );
}
