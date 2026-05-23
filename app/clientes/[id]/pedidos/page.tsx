import { ClientePedidosModule } from "@/components/ClientePedidosModule";
import { Layout } from "@/components/Layout";

type ClientePedidosPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ClientePedidosPage({ params }: ClientePedidosPageProps) {
  const { id } = await params;

  return (
    <Layout
      title="Pedidos del cliente"
      description="Historial, deuda, pedidos manuales y pagos del cliente."
    >
      <ClientePedidosModule clienteId={id} />
    </Layout>
  );
}
