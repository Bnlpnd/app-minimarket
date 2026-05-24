import { Layout } from "@/components/Layout";
import { PedidoNuevoForm } from "@/components/PedidoNuevoForm";

export default function NuevoPedidoPage() {
  return (
    <Layout
      title="Nuevo pedido"
      description="Registra pedidos manuales con cliente, productos, recojo y pago."
    >
      <PedidoNuevoForm />
    </Layout>
  );
}
