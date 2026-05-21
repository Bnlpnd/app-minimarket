import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-slate-900">
      <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
          app-minimarket
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Ingreso al sistema</h1>
        <p className="mt-2 text-sm text-slate-600">
          Pantalla base para conectar autenticacion con Supabase.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Entrar al dashboard
        </Link>
      </section>
    </main>
  );
}
