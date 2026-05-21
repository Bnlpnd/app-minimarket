"use client";

type ProductoSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function ProductoSearch({ value, onChange }: ProductoSearchProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <label
        htmlFor="producto-search"
        className="text-sm font-medium text-slate-700"
      >
        Buscar productos
      </label>
      <input
        id="producto-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Codigo, nombre, marca o categoria"
        className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
    </div>
  );
}
