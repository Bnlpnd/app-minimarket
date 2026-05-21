import { Layout } from "@/components/Layout";
import { PreparacionModule } from "@/components/PreparacionModule";

export default function PreparacionPage() {
  return (
    <Layout
      title="Preparacion"
      description="Organiza pedidos, descuenta stock al iniciar preparacion y completa el checklist."
    >
      <PreparacionModule />
    </Layout>
  );
}
