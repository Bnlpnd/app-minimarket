import { AlmacenTransferencias } from "@/components/AlmacenTransferencias";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function TransferenciasAlmacenPage() {
  return (
    <Layout
      title="Transferencias"
      description="Mueve stock entre Tienda y Casa sin permitir stock negativo."
    >
      <AlmacenTransferencias />
    </Layout>
  );
}
