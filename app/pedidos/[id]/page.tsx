import { Layout } from "@/components/Layout";
import { PedidoDetalle } from "@/components/PedidoDetalle";

type PedidoDetallePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PedidoDetallePage({
  params,
}: PedidoDetallePageProps) {
  const { id } = await params;

  return (
    <Layout
      title="Detalle de pedido"
      description="Consulta productos, cliente, pago y avance del pedido."
    >
      <PedidoDetalle pedidoId={id} />
    </Layout>
  );
}
