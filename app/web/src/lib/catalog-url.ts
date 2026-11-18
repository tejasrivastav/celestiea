import type { ArticleFilter, ArticleSort, ColorFamily } from '../api/catalog';

// Filters live in the query string so listings are shareable and CloudFront-cacheable.
export function filterFromSearch(
  search: URLSearchParams,
  category: string | undefined,
): ArticleFilter {
  const list = (name: string) => search.get(name)?.split(',').filter(Boolean);
  const cents = (name: string) => {
    const value = search.get(name);
    return value === null || value === '' ? undefined : Number(value);
  };
  const filter: ArticleFilter = {};
  if (category) filter.category = category;
  const brands = list('brand');
  if (brands) filter.brands = brands;
  const colors = list('color') as ColorFamily[] | undefined;
  if (colors) filter.colors = colors;
  const sizes = list('size');
  if (sizes) filter.sizes = sizes;
  const minPriceCents = cents('minPrice');
  if (minPriceCents !== undefined) filter.minPriceCents = minPriceCents;
  const maxPriceCents = cents('maxPrice');
  if (maxPriceCents !== undefined) filter.maxPriceCents = maxPriceCents;
  if (search.get('onSale') === 'true') filter.onSale = true;
  return filter;
}

const sorts: ArticleSort[] = ['popular', 'price_asc', 'price_desc', 'newest', 'discount'];

export function sortFromSearch(search: URLSearchParams): ArticleSort {
  const sort = search.get('sort');
  return sorts.find((candidate) => candidate === sort) ?? 'popular';
}

export function toggleListValue(
  search: URLSearchParams,
  name: string,
  value: string,
): URLSearchParams {
  const next = new URLSearchParams(search);
  const values = new Set(search.get(name)?.split(',').filter(Boolean));
  if (values.has(value)) {
    values.delete(value);
  } else {
    values.add(value);
  }
  if (values.size === 0) {
    next.delete(name);
  } else {
    next.set(name, [...values].join(','));
  }
  return next;
}
