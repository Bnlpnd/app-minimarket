"use client";

type HeaderProps = {
  title: string;
  onMenuClick: () => void;
};

export function Header({ title, onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white md:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            Minimarket Santa Ana
          </p>
          <h1 className="text-base font-semibold text-slate-950">{title}</h1>
        </div>

        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <span className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 rounded bg-current" />
            <span className="block h-0.5 w-5 rounded bg-current" />
            <span className="block h-0.5 w-5 rounded bg-current" />
          </span>
        </button>
      </div>
    </header>
  );
}
