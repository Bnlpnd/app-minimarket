"use client";

import { Suspense, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";

type LayoutProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Si true, usa ancho extra-amplio (95vw) en lugar del default (max-w-6xl). */
  wide?: boolean;
};

export function Layout({ title, description, children, wide = false }: LayoutProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:block">
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
      </div>

      {isMenuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menu"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[86vw] shadow-xl">
            <Suspense fallback={null}>
              <Sidebar onNavigate={() => setIsMenuOpen(false)} />
            </Suspense>
          </div>
        </div>
      ) : null}

      <div className="md:pl-72">
        <Header title={title} onMenuClick={() => setIsMenuOpen(true)} />

        <main className="min-h-screen">
          <section
            className={`mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${
              wide ? "max-w-[1600px]" : "max-w-6xl"
            }`}
          >
            <div className="hidden md:block">
              <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
                Minimarket Santa Ana
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {title}
              </h1>
            </div>

            {description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                {description}
              </p>
            ) : null}

            <div className="mt-6">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
