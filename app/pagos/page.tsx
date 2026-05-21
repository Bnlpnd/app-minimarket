import { Layout } from "@/components/Layout";
import { PagosYapeValidator } from "@/components/PagosYapeValidator";

export default function PagosPage() {
  return (
    <Layout
      title="Pagos"
      description="Valida o rechaza capturas de Yape sin descontar stock."
    >
      <PagosYapeValidator />
    </Layout>
  );
}
