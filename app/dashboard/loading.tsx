import { Layout } from "@/components/Layout";

export default function DashboardLoading() {
  return (
    <Layout
      title="Dashboard"
      description="Resumen operativo de pedidos, pagos, personal y stock."
    >
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-5 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-72 rounded bg-slate-100" />
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-32 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="h-4 w-28 rounded bg-slate-200" />
              <div className="mt-4 h-7 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      </div>
    </Layout>
  );
}
