import { normalizeRoutePoints } from './patrolRoutePointUtils';

export const DEFAULT_ROUTE_PAGE_SIZE = 500;
export const MAX_ROUTE_PAGES = 200;

/**
 * Extract pagination meta from Laravel envelopes / resource collections.
 * Supports nested `{ data: { data, meta } }` and flat paginator shapes.
 *
 * @param {unknown} envelope
 * @returns {{ rows: unknown[], meta: { total: number|null, currentPage: number|null, lastPage: number|null, perPage: number|null } }}
 */
export function unwrapRoutePageEnvelope(envelope) {
  const payload = envelope?.data ?? envelope;
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];

  const metaRaw = payload?.meta ?? envelope?.meta ?? {};
  const currentPage = toPositiveInt(
    metaRaw.current_page ?? metaRaw.currentPage ?? payload?.current_page ?? payload?.currentPage
  );
  const lastPage = toPositiveInt(
    metaRaw.last_page ?? metaRaw.lastPage ?? payload?.last_page ?? payload?.lastPage
  );
  const perPage = toPositiveInt(
    metaRaw.per_page ?? metaRaw.perPage ?? payload?.per_page ?? payload?.perPage
  );
  const total = toNonNegativeInt(
    metaRaw.total ?? payload?.total
  );

  return {
    rows,
    meta: {
      total,
      currentPage,
      lastPage,
      perPage
    }
  };
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return null;
  }
  return Math.floor(n);
}

function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.floor(n);
}

/**
 * Sequentially fetch every page of patrol movement points.
 *
 * @param {(page: number, perPage: number) => Promise<unknown>} fetchPage
 * @param {{
 *   perPage?: number,
 *   maxPages?: number,
 *   signal?: AbortSignal,
 * }} [options]
 * @returns {Promise<import('./patrolRoutePointUtils').PatrolRoutePoint[]>}
 */
export async function fetchAllPatrolRoutePages(fetchPage, options = {}) {
  const perPage = Math.min(
    1000,
    Math.max(1, Number(options.perPage) || DEFAULT_ROUTE_PAGE_SIZE)
  );
  const maxPages = Math.min(
    MAX_ROUTE_PAGES,
    Math.max(1, Number(options.maxPages) || MAX_ROUTE_PAGES)
  );
  const signal = options.signal;

  const allRows = [];
  let page = 1;
  let previousPage = 0;

  while (page <= maxPages) {
    if (signal?.aborted) {
      const abortError = new Error('Patrol route request was cancelled.');
      abortError.name = 'AbortError';
      throw abortError;
    }

    if (page <= previousPage) {
      throw new Error('Patrol route pagination did not advance; aborting to avoid an infinite loop.');
    }
    previousPage = page;

    let envelope;
    try {
      envelope = await fetchPage(page, perPage);
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }
      const wrapped = new Error(
        error?.message || `Failed to load patrol routes (page ${page}).`
      );
      wrapped.cause = error;
      wrapped.page = page;
      throw wrapped;
    }

    if (envelope?.success === false) {
      throw new Error(envelope?.message || `Failed to load patrol routes (page ${page}).`);
    }

    const { rows, meta } = unwrapRoutePageEnvelope(envelope);
    allRows.push(...rows);

    const rawMeta = envelope?.data?.meta ?? envelope?.meta ?? {};
    const rawLastPage = rawMeta.last_page ?? rawMeta.lastPage ?? envelope?.data?.last_page ?? envelope?.last_page;
    if (rawLastPage !== undefined && rawLastPage !== null && Number(rawLastPage) < 1) {
      throw new Error('Patrol route pagination metadata is malformed (invalid lastPage).');
    }

    const currentPage = meta.currentPage ?? page;
    if (currentPage !== page) {
      throw new Error(
        `Patrol route pagination metadata mismatch (requested page ${page}, received ${currentPage}).`
      );
    }

    if (meta.lastPage != null) {
      if (meta.lastPage < 1) {
        throw new Error('Patrol route pagination metadata is malformed (invalid lastPage).');
      }
      if (currentPage >= meta.lastPage) {
        break;
      }
      page += 1;
      continue;
    }

    // Fallback when last_page is absent: continue while a full page was returned and total says more remain.
    if (
      rows.length >= perPage &&
      meta.total != null &&
      allRows.length < meta.total
    ) {
      page += 1;
      continue;
    }

    // No trustworthy last_page/total — stop after this page rather than looping forever.
    if (rows.length < perPage || meta.total == null) {
      break;
    }

    throw new Error('Patrol route pagination metadata is malformed; cannot safely continue.');
  }

  if (page > maxPages) {
    throw new Error(`Patrol route pagination exceeded the maximum of ${maxPages} pages.`);
  }

  return normalizeRoutePoints(allRows);
}
