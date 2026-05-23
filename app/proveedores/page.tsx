import { Layout } from "@/components/Layout";
import { ProveedoresModule } from "@/components/ProveedoresModule";

export default function ProveedoresPage() {
  return (
    <Layout
      title="Proveedores"
      description="Registra distribuidores y contactos para comparar costos por producto."
    >
      <ProveedoresModule />
    </Layout>
  );
}
