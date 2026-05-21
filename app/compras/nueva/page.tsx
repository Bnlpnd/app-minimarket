import { Layout } from "@/components/Layout";

export default function NuevaCompraPage() {
  return (
    <Layout
      title="Nueva boleta de compra"
      description="Base para registrar compras del minimarket."
    >
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">
          Modulo de compras pendiente
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Esta pantalla queda preparada para registrar boletas de compra. El
          siguiente paso es crear tablas de proveedores, compras y detalle de
          compra para actualizar stock como entradas.
        </p>
      </section>
    </Layout>
  );
}
