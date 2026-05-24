export type PriceTierInput = {
  cantidad_minima: number | null;
  precio_total?: number | null;
  precio_unitario?: number | null;
  tipo_precio?: "paquete" | "unitario" | string | null;
  descripcion?: string | null;
  activo?: boolean | null;
};

export type PricingBreakdownItem = {
  cantidad: number;
  precio: number;
  descripcion: string;
};

export type PricingResult = {
  subtotal: number;
  precioUnitarioPromedio: number;
  breakdown: PricingBreakdownItem[];
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeTier(tier: PriceTierInput) {
  const cantidad = Number(tier.cantidad_minima);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return null;
  }

  const precio =
    tier.tipo_precio === "unitario"
      ? Number(tier.precio_unitario) * cantidad
      : Number(tier.precio_total ?? tier.precio_unitario);

  if (!Number.isFinite(precio) || precio < 0) {
    return null;
  }

  return {
    cantidad,
    precio: roundMoney(precio),
    descripcion: tier.descripcion || `Mayor x${cantidad}`,
  };
}

export function calcularPrecioPorCantidad(
  cantidad: number,
  precioBase: number,
  tiers: PriceTierInput[] = [],
): PricingResult {
  const safeCantidad = Number(cantidad);
  const safePrecioBase = Number(precioBase);

  if (
    !Number.isFinite(safeCantidad) ||
    safeCantidad <= 0 ||
    !Number.isFinite(safePrecioBase) ||
    safePrecioBase < 0
  ) {
    return { subtotal: 0, precioUnitarioPromedio: 0, breakdown: [] };
  }

  const isIntegerQuantity = Number.isInteger(safeCantidad);
  const normalizedTiers = tiers
    .filter((tier) => tier.activo !== false)
    .map(normalizeTier)
    .filter((tier): tier is NonNullable<ReturnType<typeof normalizeTier>> =>
      Boolean(tier),
    )
    .filter((tier) => Number.isInteger(tier.cantidad))
    .sort((a, b) => b.cantidad - a.cantidad);

  if (!isIntegerQuantity || normalizedTiers.length === 0) {
    const subtotal = roundMoney(safeCantidad * safePrecioBase);
    return {
      subtotal,
      precioUnitarioPromedio: roundMoney(subtotal / safeCantidad),
      breakdown: [
        {
          cantidad: safeCantidad,
          precio: subtotal,
          descripcion: "Precio regular",
        },
      ],
    };
  }

  let remaining = safeCantidad;
  let subtotal = 0;
  const breakdown: PricingBreakdownItem[] = [];

  for (const tier of normalizedTiers) {
    const blocks = Math.floor(remaining / tier.cantidad);
    if (blocks <= 0) {
      continue;
    }

    const tierSubtotal = roundMoney(blocks * tier.precio);
    subtotal += tierSubtotal;
    remaining -= blocks * tier.cantidad;
    breakdown.push({
      cantidad: blocks * tier.cantidad,
      precio: tierSubtotal,
      descripcion: `${blocks} x ${tier.descripcion}`,
    });
  }

  if (remaining > 0) {
    const regularSubtotal = roundMoney(remaining * safePrecioBase);
    subtotal += regularSubtotal;
    breakdown.push({
      cantidad: remaining,
      precio: regularSubtotal,
      descripcion: "Precio regular",
    });
  }

  const roundedSubtotal = roundMoney(subtotal);
  return {
    subtotal: roundedSubtotal,
    precioUnitarioPromedio: roundMoney(roundedSubtotal / safeCantidad),
    breakdown,
  };
}
