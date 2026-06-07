"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * Combobox autocomplete: input editable + dropdown filtrable.
 *
 * Reemplaza al <select> cuando hay muchas opciones (marcas, categorias).
 * Comportamiento:
 *   - Al hacer focus o tipear, abre el dropdown con opciones que matcheen
 *     el query (busqueda case-insensitive en label y subLabel).
 *   - Click en una opcion la selecciona y cierra.
 *   - Teclado: ArrowUp/ArrowDown navega, Enter selecciona, Escape cierra.
 *   - Si el usuario escribe algo y hace blur sin elegir, el valor previo
 *     se mantiene (no inventa selecciones a medias).
 *   - Cuando NO esta enfocado y hay value, muestra el label de la opcion
 *     seleccionada (no el query del usuario).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  id: string;
  label: string;
  /** Subtitulo opcional mostrado en el dropdown (no se filtra por defecto, si). */
  sub?: string;
};

type Props = {
  value: string;
  options: SearchableOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Texto que aparece cuando no hay opciones tras filtrar. */
  emptyText?: string;
  /** Si true, no permite limpiar la seleccion (no muestra "x"). */
  required?: boolean;
};

const baseClass =
  "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-santa-600 focus:ring-2 focus:ring-santa-100";

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Buscar...",
  className,
  disabled = false,
  emptyText = "Sin coincidencias",
  required = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const selected = useMemo(
    () => options.find((opt) => opt.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const label = opt.label.toLowerCase();
      const sub = (opt.sub ?? "").toLowerCase();
      return label.includes(q) || sub.includes(q);
    });
  }, [options, query]);

  // Resetear highlight cuando cambia el filtro.
  useEffect(() => {
    setHighlight(0);
  }, [query, isOpen]);

  // Cerrar al hacer click fuera.
  useEffect(() => {
    if (!isOpen) return;
    function onClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  function pick(id: string) {
    onChange(id);
    setIsOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function clear() {
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) setIsOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = filtered[highlight];
      if (target) pick(target.id);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  }

  // Cuando no esta enfocado, mostrar label de la seleccion; cuando si,
  // mostrar lo que el usuario tipea.
  const displayValue = isOpen ? query : selected?.label ?? "";

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={displayValue}
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
        className={baseClass}
      />
      {/* Boton clear: solo si hay seleccion, no es required y no esta deshabilitado. */}
      {selected && !required && !disabled ? (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(event) => {
            // mousedown para ganar al blur del input.
            event.preventDefault();
            clear();
          }}
          aria-label="Limpiar seleccion"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      ) : null}

      {isOpen && !disabled ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>
          ) : (
            filtered.map((opt, index) => {
              const isSel = opt.id === value;
              const isHigh = index === highlight;
              return (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={isSel}
                  onMouseDown={(event) => {
                    // mousedown para no perder el click cuando el input pierde foco.
                    event.preventDefault();
                    pick(opt.id);
                  }}
                  onMouseEnter={() => setHighlight(index)}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    isHigh
                      ? "bg-santa-50 text-santa-900"
                      : isSel
                        ? "bg-slate-50 font-medium text-slate-900"
                        : "text-slate-700"
                  }`}
                >
                  <span className="block">{opt.label}</span>
                  {opt.sub ? (
                    <span className="block text-xs text-slate-500">{opt.sub}</span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
