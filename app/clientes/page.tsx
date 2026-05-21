import { ClienteModule } from "@/components/ClienteModule";
import { Layout } from "@/components/Layout";

export default function ClientesPage() {
  return (
    <Layout
      title="Clientes"
      description="Clientes rapidos para pedidos manuales por WhatsApp o compras en tienda."
    >
      <ClienteModule />
    </Layout>
  );
}
