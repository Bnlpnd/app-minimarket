import { AlmacenProductos } from "@/components/AlmacenProductos";
import { Layout } from "@/components/Layout";

export const dynamic = "force-dynamic";

export default function ProductosAlmacenPage() {
  return (
    <Layout
      title="Productos Almacén"
      description="Stock por producto desglosado por almacén y por cada presentación de compra registrada."
      wide
    >
      <AlmacenProductos />
    </Layout>
  );
}
