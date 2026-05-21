import { Layout } from "@/components/Layout";
import { PedidosList } from "@/components/PedidosList";

export default function PedidosPage() {
  return (
    <Layout
      title="Pedidos"
      description="Consulta pedidos, filtra por estado y revisa su detalle."
    >
      <PedidosList />
    </Layout>
  );
}
