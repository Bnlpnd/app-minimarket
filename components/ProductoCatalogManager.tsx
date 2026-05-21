"use client";

import { useMemo, useState } from "react";
import type { Categoria, Marca, Subcategoria } from "@/types/database";

type ProductoCatalogManagerProps = {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  marcas: Marca[];
  isSaving: boolean;
  onCreateCategoria: (nombre: string) => Promise<void>;
  onCreateSubcategoria: (categoriaId: string, nombre: string) => Promise<void>;
  onCreateMarca: (nombre: string) => Promise<void>;
  onUpdateCategoria: (categoriaId: string, nombre: string) => Promise<void>;
  onUpdateSubcategoria: (subcategoriaId: string, nombre: string) => Promise<void>;
};

export function ProductoCatalogManager({
  categorias,
  subcategorias,
  marcas,
  isSaving,
  onCreateCategoria,
  onCreateSubcategoria,
  onCreateMarca,
  onUpdateCategoria,
  onUpdateSubcategoria,
}: ProductoCatalogManagerProps) {
  const [categoriaNombre, setCategoriaNombre] = useState("");
  const [subcategoriaNombre, setSubcategoriaNombre] = useState("");
  const [subcategoriaCategoriaId, setSubcategoriaCategoriaId] = useState("");
  const [marcaNombre, setMarcaNombre] = useState("");
  const [editCategoriaId, setEditCategoriaId] = useState("");
  const [editCategoriaNombre, setEditCategoriaNombre] = useState("");
  const [editSubcategoriaId, setEditSubcategoriaId] = useState("");
  const [editSubcategoriaNombre, setEditSubcategoriaNombre] = useState("");

  const subcategoriasPorCategoria = useMemo(() => {
    return categorias.map((categoria) => ({
      categoria,
      subcategorias: subcategorias.filter(
        (subcategoria) => subcategoria.categoria_id === categoria.id,
      ),
    }));
  }, [categorias, subcategorias]);

  async function handleCreateCategoria(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateCategoria(categoriaNombre);
    setCategoriaNombre("");
  }

  async function handleCreateSubcategoria(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    await onCreateSubcategoria(subcategoriaCategoriaId, subcategoriaNombre);
    setSubcategoriaNombre("");
  }

  async function handleCreateMarca(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateMarca(marcaNombre);
    setMarcaNombre("");
  }

  async function handleUpdateCategoria(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdateCategoria(editCategoriaId, editCategoriaNombre);
  }

  async function handleUpdateSubcategoria(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    await onUpdateSubcategoria(editSubcategoriaId, editSubcategoriaNombre);
  }

  function handleSelectEditCategoria(categoriaId: string) {
    setEditCategoriaId(categoriaId);
    setEditCategoriaNombre(
      categorias.find((categoria) => categoria.id === categoriaId)?.nombre ?? "",
    );
  }

  function handleSelectEditSubcategoria(subcategoriaId: string) {
    setEditSubcategoriaId(subcategoriaId);
    setEditSubcategoriaNombre(
      subcategorias.find((subcategoria) => subcategoria.id === subcategoriaId)
        ?.nombre ?? "",
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-950">
          Catalogos para productos
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Crea categorias, subcategorias y marcas antes de registrar productos.
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <CatalogForm title="Categoria" onSubmit={handleCreateCategoria}>
          <input
            type="text"
            value={categoriaNombre}
            onChange={(event) => setCategoriaNombre(event.target.value)}
            placeholder="Ej. Abarrotes"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <SubmitButton disabled={isSaving}>Crear categoria</SubmitButton>
        </CatalogForm>

        <CatalogForm title="Subcategoria" onSubmit={handleCreateSubcategoria}>
          <select
            value={subcategoriaCategoriaId}
            onChange={(event) => setSubcategoriaCategoriaId(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={subcategoriaNombre}
            onChange={(event) => setSubcategoriaNombre(event.target.value)}
            placeholder="Ej. Arroz"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <SubmitButton disabled={isSaving}>Crear subcategoria</SubmitButton>
        </CatalogForm>

        <CatalogForm title="Marca" onSubmit={handleCreateMarca}>
          <input
            type="text"
            value={marcaNombre}
            onChange={(event) => setMarcaNombre(event.target.value)}
            placeholder="Ej. Costeno"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <SubmitButton disabled={isSaving}>Crear marca</SubmitButton>
        </CatalogForm>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CatalogForm
          title="Corregir nombre de categoria"
          onSubmit={handleUpdateCategoria}
        >
          <select
            value={editCategoriaId}
            onChange={(event) => handleSelectEditCategoria(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Seleccionar categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={editCategoriaNombre}
            onChange={(event) => setEditCategoriaNombre(event.target.value)}
            placeholder="Nuevo nombre"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <SubmitButton disabled={isSaving}>Guardar categoria</SubmitButton>
        </CatalogForm>

        <CatalogForm
          title="Corregir nombre de subcategoria"
          onSubmit={handleUpdateSubcategoria}
        >
          <select
            value={editSubcategoriaId}
            onChange={(event) => handleSelectEditSubcategoria(event.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Seleccionar subcategoria</option>
            {subcategoriasPorCategoria.flatMap(({ categoria, subcategorias }) =>
              subcategorias.map((subcategoria) => (
                <option key={subcategoria.id} value={subcategoria.id}>
                  {categoria.nombre} / {subcategoria.nombre}
                </option>
              )),
            )}
          </select>
          <input
            type="text"
            value={editSubcategoriaNombre}
            onChange={(event) => setEditSubcategoriaNombre(event.target.value)}
            placeholder="Nuevo nombre"
            className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
          <SubmitButton disabled={isSaving}>Guardar subcategoria</SubmitButton>
        </CatalogForm>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <CatalogList title="Categorias" items={categorias.map((item) => item.nombre)} />
        <CatalogList
          title="Subcategorias"
          items={subcategoriasPorCategoria.flatMap(({ categoria, subcategorias }) =>
            subcategorias.map(
              (subcategoria) => `${categoria.nombre} / ${subcategoria.nombre}`,
            ),
          )}
        />
        <CatalogList title="Marcas" items={marcas.map((item) => item.nombre)} />
      </div>
    </section>
  );
}

function CatalogForm({
  title,
  children,
  onSubmit,
}: {
  title: string;
  children: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </form>
  );
}

function SubmitButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-10 w-full rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      {children}
    </button>
  );
}

function CatalogList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
          {items.length}
        </span>
      </div>
      <div className="mt-3 max-h-36 space-y-1 overflow-auto text-sm text-slate-600">
        {items.length > 0 ? (
          items.map((item) => (
            <p key={item} className="rounded bg-slate-50 px-2 py-1">
              {item}
            </p>
          ))
        ) : (
          <p className="text-slate-400">Sin registros</p>
        )}
      </div>
    </div>
  );
}
