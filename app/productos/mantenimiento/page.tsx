"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { getCurrentUserProfile, isAdmin } from "@/lib/authRoles";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type {
  Categoria,
  Marca,
  Presentacion,
  Subcategoria,
} from "@/types/database";

type CatalogType =
  | "categorias"
  | "subcategorias"
  | "marcas"
  | "presentaciones";

type CatalogItem = {
  id: string;
  nombre: string;
  activo: boolean;
  categoria_id?: string;
};

type Message = {
  type: "success" | "error";
  text: string;
};

type EstadoFilter = "todos" | "activos" | "inactivos";

const tabs: Array<{ value: CatalogType; label: string }> = [
  { value: "categorias", label: "Categorias" },
  { value: "subcategorias", label: "Subcategorias" },
  { value: "marcas", label: "Marcas" },
  { value: "presentaciones", label: "Presentaciones" },
];

const inputClassName =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function ProductosMantenimientoPage() {
  const [activeTab, setActiveTab] = useState<CatalogType>("categorias");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [presentaciones, setPresentaciones] = useState<Presentacion[]>([]);
  const [nombre, setNombre] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
  const [categoriaId, setCategoriaId] = useState("");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function checkAccess() {
    const { profile, error } = await getCurrentUserProfile();

    if (error) {
      setAccessMessage(error);
      setHasAdminAccess(false);
    } else if (!profile) {
      setAccessMessage("Debes iniciar sesion con un usuario admin para acceder a mantenimiento.");
      setHasAdminAccess(false);
    } else if (!isAdmin(profile)) {
      setAccessMessage("Tu usuario no tiene permiso admin para administrar catalogos.");
      setHasAdminAccess(false);
    } else {
      setAccessMessage(null);
      setHasAdminAccess(true);
      await loadAll();
    }

    setIsCheckingAccess(false);
  }

  async function loadAll() {
    if (supabaseConfigError || !supabase) {
      setMessage({ type: "error", text: supabaseConfigError ?? "" });
      return;
    }

    const [
      categoriasResult,
      subcategoriasResult,
      marcasResult,
      presentacionesResult,
    ] = await Promise.all([
      supabase.from("categorias").select("*").order("nombre"),
      supabase.from("subcategorias").select("*").order("nombre"),
      supabase.from("marcas").select("*").order("nombre"),
      supabase.from("presentaciones").select("*").order("nombre"),
    ]);

    if (
      categoriasResult.error ||
      subcategoriasResult.error ||
      marcasResult.error ||
      presentacionesResult.error
    ) {
      setMessage({ type: "error", text: "No se pudieron cargar catalogos." });
      return;
    }

    setCategorias((categoriasResult.data ?? []) as Categoria[]);
    setSubcategorias((subcategoriasResult.data ?? []) as Subcategoria[]);
    setMarcas((marcasResult.data ?? []) as Marca[]);
    setPresentaciones((presentacionesResult.data ?? []) as Presentacion[]);
  }

  useEffect(() => {
    void checkAccess();
  }, []);

  const items = useMemo<CatalogItem[]>(() => {
    if (activeTab === "categorias") {
      return categorias;
    }
    if (activeTab === "subcategorias") {
      return subcategorias;
    }
    if (activeTab === "marcas") {
      return marcas;
    }
    if (activeTab === "presentaciones") {
      return presentaciones;
    }
    return [];
  }, [activeTab, categorias, marcas, presentaciones, subcategorias]);

  const filteredItems = useMemo(() => {
    const term = normalizeKey(appliedSearch);

    return items.filter((item) => {
      const matchesSearch = term ? normalizeKey(item.nombre).includes(term) : true;
      const matchesEstado =
        estadoFilter === "todos" ||
        (estadoFilter === "activos" && item.activo) ||
        (estadoFilter === "inactivos" && !item.activo);

      return matchesSearch && matchesEstado;
    });
  }, [appliedSearch, estadoFilter, items]);

  function startEdit(item: CatalogItem) {
    setEditing(item);
    setNombre(item.nombre);
    setCategoriaId(item.categoria_id ?? "");
  }

  function resetForm() {
    setEditing(null);
    setNombre("");
    setCategoriaId("");
  }

  function resetTab(tab: CatalogType) {
    setActiveTab(tab);
    setSearchInput("");
    setAppliedSearch("");
    setEstadoFilter("todos");
    resetForm();
  }

  async function itemUsageCount(type: CatalogType, item: CatalogItem) {
    if (!supabase) {
      return 0;
    }

    if (type === "categorias") {
      const { count } = await supabase
        .from("productos")
        .select("*", { count: "exact", head: true })
        .eq("categoria_id", item.id);
      return count ?? 0;
    }
    if (type === "subcategorias") {
      const { count } = await supabase
        .from("productos")
        .select("*", { count: "exact", head: true })
        .eq("subcategoria_id", item.id);
      return count ?? 0;
    }
    if (type === "marcas") {
      const { count } = await supabase
        .from("productos")
        .select("*", { count: "exact", head: true })
        .eq("marca_id", item.id);
      return count ?? 0;
    }

    const { count } = await supabase
      .from("productos")
      .select("*", { count: "exact", head: true })
      .eq("presentacion", item.nombre);
    return count ?? 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      return;
    }

    const normalized = normalizeSpaces(nombre);
    if (!normalized) {
      setMessage({ type: "error", text: "Ingresa un nombre." });
      return;
    }

    if (activeTab === "subcategorias" && !categoriaId) {
      setMessage({ type: "error", text: "Selecciona una categoria." });
      return;
    }

    const duplicated = items.some(
      (item) =>
        item.id !== editing?.id &&
        normalizeKey(item.nombre) === normalizeKey(normalized) &&
        (activeTab !== "subcategorias" || item.categoria_id === categoriaId),
    );
    if (duplicated) {
      setMessage({ type: "error", text: "Ya existe un registro con ese nombre." });
      return;
    }

    setIsSaving(true);
    const payload =
      activeTab === "subcategorias"
        ? { nombre: normalized, categoria_id: categoriaId }
        : { nombre: normalized };
    const dbPayload = payload as Record<string, string>;
    const result = editing
      ? await supabase.from(activeTab).update(dbPayload).eq("id", editing.id)
      : await supabase.from(activeTab).insert(dbPayload);
    setIsSaving(false);

    if (result.error) {
      setMessage({ type: "error", text: `No se pudo guardar: ${result.error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Registro guardado." });
    resetForm();
    await loadAll();
  }

  async function toggleActivo(item: CatalogItem) {
    if (!supabase) {
      return;
    }
    const { error } = await supabase
      .from(activeTab)
      .update({ activo: !item.activo })
      .eq("id", item.id);

    if (error) {
      setMessage({ type: "error", text: `No se pudo cambiar estado: ${error.message}` });
      return;
    }

    setMessage({ type: "success", text: "Estado actualizado." });
    await loadAll();
  }

  async function deleteOrDisable(item: CatalogItem) {
    if (!supabase) {
      return;
    }
    const used = await itemUsageCount(activeTab, item);

    if (used > 0) {
      const { error } = await supabase
        .from(activeTab)
        .update({ activo: false })
        .eq("id", item.id);
      if (error) {
        setMessage({ type: "error", text: `No se pudo desactivar: ${error.message}` });
        return;
      }
      setMessage({
        type: "success",
        text: "El registro esta en uso; se desactivo en lugar de eliminarse.",
      });
    } else {
      const { error } = await supabase.from(activeTab).delete().eq("id", item.id);
      if (error) {
        setMessage({ type: "error", text: `No se pudo eliminar: ${error.message}` });
        return;
      }
      setMessage({ type: "success", text: "Registro eliminado." });
    }

    await loadAll();
  }

  return (
    <Layout
      title="Mantenimiento"
      description="Administra catalogos sin saturar la pantalla de productos."
    >
      <div className="space-y-5">
        {isCheckingAccess ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Verificando permisos...
          </section>
        ) : null}

        {!isCheckingAccess && !hasAdminAccess ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <h2 className="text-base font-semibold text-amber-950">
              Acceso restringido
            </h2>
            <p className="mt-2">{accessMessage}</p>
            <a
              href="/login"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
            >
              Ir al login
            </a>
          </section>
        ) : null}

        {!hasAdminAccess ? null : (
          <>
        {message ? (
          <div
            className={`rounded-lg border p-4 text-sm ${
              message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => resetTab(tab.value)}
                className={`h-10 rounded-md px-3 text-sm font-medium ${
                  activeTab === tab.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-950">
              {editing ? "Editar registro" : "Nuevo registro"}
            </h2>
            <div className="mt-4 space-y-3">
              {activeTab === "subcategorias" ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    Categoria
                  </span>
                  <select
                    value={categoriaId}
                    onChange={(event) => setCategoriaId(event.target.value)}
                    className={`${inputClassName} mt-1`}
                  >
                    <option value="">Seleccionar</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <input
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                  className={`${inputClassName} mt-1`}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-11 flex-1 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-slate-300"
                >
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
                {editing ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">
                {tabs.find((tab) => tab.value === activeTab)?.label}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Si esta en uso, eliminar lo desactiva.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={`Buscar en ${
                    tabs.find((tab) => tab.value === activeTab)?.label.toLowerCase() ??
                    "catalogo"
                  }`}
                  className={`${inputClassName} sm:max-w-sm`}
                />
                <select
                  value={estadoFilter}
                  onChange={(event) => setEstadoFilter(event.target.value as EstadoFilter)}
                  className={`${inputClassName} sm:max-w-[160px]`}
                >
                  <option value="todos">Todos</option>
                  <option value="activos">Activos</option>
                  <option value="inactivos">Inactivos</option>
                </select>
                <button
                  type="button"
                  onClick={() => setAppliedSearch(searchInput)}
                  className="h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white"
                >
                  Buscar
                </button>
                {appliedSearch ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setAppliedSearch("");
                    }}
                    className="h-11 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700"
                  >
                    Limpiar
                  </button>
                ) : null}
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  No hay registros con esa busqueda.
                </p>
              ) : null}
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-950">{item.nombre}</p>
                    {activeTab === "subcategorias" ? (
                      <p className="text-xs text-slate-500">
                        {
                          categorias.find(
                            (categoria) => categoria.id === item.categoria_id,
                          )?.nombre
                        }
                      </p>
                    ) : null}
                    <span
                      className={`mt-2 inline-flex rounded-md px-2 py-1 text-xs font-medium ${
                        item.activo
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleActivo(item)}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700"
                    >
                      {item.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteOrDisable(item)}
                      className="h-10 rounded-md border border-red-300 px-3 text-sm font-medium text-red-700"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
          </>
        )}
      </div>
    </Layout>
  );
}
