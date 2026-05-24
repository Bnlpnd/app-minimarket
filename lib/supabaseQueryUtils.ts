type SupabaseRangeQuery<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>;
};

export async function fetchAllRows<T>(
  query: SupabaseRangeQuery<T>,
  options: { pageSize?: number; maxRows?: number } = {},
) {
  const pageSize = options.pageSize ?? 1000;
  const maxRows = options.maxRows ?? 10000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await query.range(from, to);

    if (error) {
      return { data: rows, error };
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return { data: rows, error: null };
}
