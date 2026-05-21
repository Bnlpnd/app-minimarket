import { Layout } from "@/components/Layout";
import { ProductoImportCsv } from "@/components/ProductoImportCsv";
import { supabase, supabaseConfigError } from "@/lib/supabaseClient";
import type { Categoria, Marca, Subcategoria } from "@/types/database";

export const dynamic = "force-dynamic";

async function loadCatalogos() {
  if (supabaseConfigError || !supabase) {
    return {
      categorias: [] as Categoria[],
      subcategorias: [] as Subcategoria[],
      marcas: [] as Marca[],
    };
  }

  const [categorias, subcategorias, marcas] = await Promise.all([
    supabase
      .from("categorias")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
    supabase
      .from("subcategorias")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
    supabase
      .from("marcas")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true }),
  ]);

  return {
    categorias: (categorias.data ?? []) as Categoria[],
    subcategorias: (subcategorias.data ?? []) as Subcategoria[],
    marcas: (marcas.data ?? []) as Marca[],
  };
}

export default async function ImportarProductosPage() {
  const catalogos = await loadCatalogos();

  return (
    <Layout
      title="Importar productos"
      description="Carga productos desde un archivo CSV exportado desde Excel."
    >
      <ProductoImportCsv
        initialCategorias={catalogos.categorias}
        initialSubcategorias={catalogos.subcategorias}
        initialMarcas={catalogos.marcas}
      />
    </Layout>
  );
}
