import type { ArticleSort, ColorFamily, TargetGroup } from './catalog';
import { decodeCursor, type Cursor } from './cursor';
import { DomainError, type FieldError } from './errors';

export const defaultPageSize = 24;
export const maxPageSize = 96;

export interface ArticleFilter {
  category?: string;
  brands?: string[];
  colors?: ColorFamily[];
  sizes?: string[];
  minPriceCents?: number;
  maxPriceCents?: number;
  targetGroup?: TargetGroup;
  onSale?: boolean;
  inStock: boolean;
}

export interface ArticleListQuery {
  filter: ArticleFilter;
  sort: ArticleSort;
  first: number;
  after: Cursor | null;
}

// GraphQL hands over explicit nulls for omitted optional input fields.
type Nullable<T> = { [K in keyof T]?: T[K] | null };

export interface ArticleListInput {
  filter?: Nullable<ArticleFilter> | null;
  sort?: ArticleSort | null;
  first?: number | null;
  after?: string | null;
}

export function parseArticleListQuery(input: ArticleListInput): ArticleListQuery {
  const raw = input.filter ?? {};
  const filter: ArticleFilter = { inStock: raw.inStock ?? true };
  if (raw.category) filter.category = raw.category;
  if (raw.brands?.length) filter.brands = raw.brands;
  if (raw.colors?.length) filter.colors = raw.colors;
  if (raw.sizes?.length) filter.sizes = raw.sizes;
  if (raw.minPriceCents != null) filter.minPriceCents = raw.minPriceCents;
  if (raw.maxPriceCents != null) filter.maxPriceCents = raw.maxPriceCents;
  if (raw.targetGroup) filter.targetGroup = raw.targetGroup;
  if (raw.onSale) filter.onSale = true;

  const sort = input.sort ?? 'popular';
  const first = input.first ?? defaultPageSize;

  const fieldErrors: FieldError[] = [];
  if (first < 1 || first > maxPageSize) {
    fieldErrors.push({ path: 'first', message: `Must be between 1 and ${maxPageSize}` });
  }
  if ((filter.minPriceCents ?? 0) < 0 || (filter.maxPriceCents ?? 0) < 0) {
    fieldErrors.push({ path: 'filter', message: 'Prices cannot be negative' });
  }
  if (
    filter.minPriceCents !== undefined &&
    filter.maxPriceCents !== undefined &&
    filter.minPriceCents > filter.maxPriceCents
  ) {
    fieldErrors.push({ path: 'filter.minPriceCents', message: 'Must not exceed maxPriceCents' });
  }
  if (fieldErrors.length > 0) {
    throw new DomainError('validation_failed', 'The article query is invalid.', fieldErrors);
  }

  return { filter, sort, first, after: input.after ? decodeCursor(input.after, sort) : null };
}
