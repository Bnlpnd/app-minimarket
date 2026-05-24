import { AlmacenTransferencias } from "@/components/AlmacenTransferencias";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function TransferenciasAlmacenPage() {
  return (
    <Layout
      title="Transferencias"
      description="Prepara envios de Casa a Negocio y pedidos de abastecimiento."
    >
      <AlmacenTransferencias />
    </Layout>
  );
}
