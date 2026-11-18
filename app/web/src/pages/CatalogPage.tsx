import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { fetchArticles, type ArticleSort, type Category } from '../api/catalog';
import { ArticleCard } from '../components/ArticleCard';
import { useReferenceData } from '../components/useReferenceData';
import { filterFromSearch, sortFromSearch } from '../lib/catalog-url';
import { FilterPanel } from './FilterPanel';

const sortLabels: Record<ArticleSort, string> = {
  popular: 'Popular',
  newest: 'New in',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  discount: 'Biggest discount',
};

export default function CatalogPage() {
  const { categorySlug } = useParams();
  const [search, setSearch] = useSearchParams();
  const filter = filterFromSearch(search, categorySlug);
  const sort = sortFromSearch(search);
  const reference = useReferenceData();
  const categories = reference.data?.categories ?? [];
  const category = categories.find((candidate) => candidate.slug === categorySlug);

  const articles = useInfiniteQuery({
    queryKey: ['articles', filter, sort],
    queryFn: ({ pageParam }) => fetchArticles(filter, sort, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null),
  });
  const tiles = articles.data?.pages.flatMap((page) => page.nodes) ?? [];
  const total = articles.data?.pages[0]?.totalCount;

  function changeSort(nextSort: string) {
    const next = new URLSearchParams(search);
    next.set('sort', nextSort);
    setSearch(next);
  }

  return (
    <div className="catalog">
      <aside className="catalog-sidebar">
        <CategoryNav categories={categories} current={category} />
        {reference.data && (
          <FilterPanel
            category={category}
            brands={reference.data.brands}
            sizeCharts={reference.data.sizeCharts}
          />
        )}
      </aside>
      <section className="catalog-results" aria-labelledby="catalog-title">
        <div className="catalog-toolbar">
          <h1 id="catalog-title">{category?.name ?? 'All products'}</h1>
          {total && (
            <p className="result-count">
              {total.value.toLocaleString('en-IE')}
              {total.isCapped ? '+' : ''} items
            </p>
          )}
          <label className="sort">
            Sort
            <select value={sort} onChange={(event) => changeSort(event.target.value)}>
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {articles.isPending && <p className="status">Loading…</p>}
        {articles.isError && <p className="status error">We couldn't load products. Try again.</p>}
        {articles.isSuccess && tiles.length === 0 && (
          <p className="status">No products match these filters.</p>
        )}
        <ul className="article-grid">
          {tiles.map((article) => (
            <ArticleCard key={article.sku} article={article} />
          ))}
        </ul>
        {articles.hasNextPage && (
          <button
            className="button load-more"
            onClick={() => void articles.fetchNextPage()}
            disabled={articles.isFetchingNextPage}
          >
            {articles.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </section>
    </div>
  );
}

// Lists the subcategories of the current category, or its siblings when it is a leaf,
// with a link one level up.
function CategoryNav({
  categories,
  current,
}: {
  categories: Category[];
  current: Category | undefined;
}) {
  const containerSlug =
    current === undefined ? null : current.isLeaf ? current.parentSlug : current.slug;
  const container = categories.find((category) => category.slug === containerSlug);
  const children = categories.filter((category) => category.parentSlug === containerSlug);
  const up = categories.find((category) => category.slug === container?.parentSlug);
  return (
    <nav aria-label="Categories" className="category-nav">
      {container && (
        <Link className="category-up" to={up ? `/c/${up.slug}` : '/'}>
          ‹ {up ? up.name : 'All products'}
        </Link>
      )}
      <ul>
        {children.map((category) => (
          <li key={category.slug}>
            <Link
              to={`/c/${category.slug}`}
              aria-current={category.slug === current?.slug ? 'page' : undefined}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
