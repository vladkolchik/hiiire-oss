type SupabaseQueryError = {
  code?: string | null;
  message?: string | null;
} | null;

type PagedSupabaseQueryResult<Row> = {
  data: Row[] | null;
  error: SupabaseQueryError;
  count: number | null;
};

type CountSupabaseQueryResult = {
  count: number | null;
  error: SupabaseQueryError;
};

type AllSupabaseRowsQueryResult<Row> = {
  data: Row[] | null;
  error: unknown;
};

const DEFAULT_SUPABASE_ALL_ROWS_PAGE_SIZE = 1000;
const DEFAULT_SUPABASE_ALL_ROWS_MAX_ROWS = 200_000;
const DEFAULT_SUPABASE_FILTER_VALUE_CHUNK_SIZE = 200;

function isRangeNotSatisfiableError(error: SupabaseQueryError): error is NonNullable<SupabaseQueryError> {
  return Boolean(error && error.code === "PGRST103");
}

export async function loadPagedSupabaseRows<Row>(input: {
  runPageQuery: () => Promise<PagedSupabaseQueryResult<Row>>;
  runCountQuery: () => Promise<CountSupabaseQueryResult>;
}): Promise<{
  rows: Row[];
  total: number;
  recoveredFromOutOfRange: boolean;
}> {
  const pageResult = await input.runPageQuery();

  if (!pageResult.error) {
    return {
      rows: pageResult.data ?? [],
      total: typeof pageResult.count === "number" ? pageResult.count : 0,
      recoveredFromOutOfRange: false,
    };
  }

  if (!isRangeNotSatisfiableError(pageResult.error)) {
    throw pageResult.error;
  }

  const countResult = await input.runCountQuery();
  if (countResult.error) throw countResult.error;

  return {
    rows: [],
    total: typeof countResult.count === "number" ? countResult.count : 0,
    recoveredFromOutOfRange: true,
  };
}

export async function loadAllSupabaseRows<Row>(input: {
  runPageQuery: (from: number, to: number) => PromiseLike<AllSupabaseRowsQueryResult<Row>>;
  pageSize?: number;
  maxRows?: number;
}): Promise<Row[]> {
  const pageSize = Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_SUPABASE_ALL_ROWS_PAGE_SIZE));
  const maxRows = Math.max(1, Math.trunc(input.maxRows ?? DEFAULT_SUPABASE_ALL_ROWS_MAX_ROWS));
  const rows: Row[] = [];
  let from = 0;

  while (true) {
    const querySize = Math.min(pageSize, maxRows - rows.length + 1);
    const to = from + querySize - 1;
    const { data, error } = await input.runPageQuery(from, to);
    if (error) throw error;

    const pageRows = data ?? [];
    if (rows.length + pageRows.length > maxRows) {
      throw new Error(`Supabase query exceeded ${maxRows} rows`);
    }

    rows.push(...pageRows);
    if (pageRows.length < querySize) return rows;
    from += querySize;

    if (rows.length === maxRows) {
      const overflowResult = await input.runPageQuery(from, from);
      if (overflowResult.error) throw overflowResult.error;
      if ((overflowResult.data ?? []).length > 0) {
        throw new Error(`Supabase query exceeded ${maxRows} rows`);
      }
      return rows;
    }
  }
}

export async function loadAllSupabaseRowsForValues<Row, Value>(input: {
  values: readonly Value[];
  runChunkPageQuery: (values: readonly Value[], from: number, to: number) => PromiseLike<AllSupabaseRowsQueryResult<Row>>;
  chunkSize?: number;
  pageSize?: number;
  maxRows?: number;
}): Promise<Row[]> {
  const chunkSize = Math.max(1, Math.trunc(input.chunkSize ?? DEFAULT_SUPABASE_FILTER_VALUE_CHUNK_SIZE));
  const maxRows = Math.max(1, Math.trunc(input.maxRows ?? DEFAULT_SUPABASE_ALL_ROWS_MAX_ROWS));
  const rows: Row[] = [];

  for (let start = 0; start < input.values.length; start += chunkSize) {
    const valueChunk = input.values.slice(start, start + chunkSize);
    const chunkRows = await loadAllSupabaseRows<Row>({
      maxRows,
      pageSize: input.pageSize,
      runPageQuery: (from, to) => input.runChunkPageQuery(valueChunk, from, to),
    });

    if (rows.length + chunkRows.length > maxRows) {
      throw new Error(`Supabase query exceeded ${maxRows} rows`);
    }
    rows.push(...chunkRows);
  }

  return rows;
}
