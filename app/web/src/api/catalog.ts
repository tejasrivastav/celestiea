import { graphql } from './graphql';

export type ColorFamily =
  | 'black'
  | 'white'
  | 'grey'
  | 'blue'
  | 'navy'
  | 'red'
  | 'pink'
  | 'green'
  | 'khaki'
  | 'beige'
  | 'brown'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'multicolour';
export type ArticleSort = 'popular' | 'price_asc' | 'price_desc' | 'newest' | 'discount';
export type SizeAvailability = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface Price {
  currentCents: number;
  originalCents: number | null;
  discountPct: number;
}

export interface Image {
  kind: string;
  url: string;
  width: number;
  height: number;
}

export interface ArticleTile {
  sku: string;
  productName: string;
  brand: { name: string };
  colorName: string;
  price: Price;
  image: Image | null;
  availableSizes: string[];
}

export interface ArticleFilter {
  category?: string;
  brands?: string[];
  colors?: ColorFamily[];
  sizes?: string[];
  minPriceCents?: number;
  maxPriceCents?: number;
  onSale?: boolean;
}

export interface ArticlePage {
  nodes: ArticleTile[];
  pageInfo: { endCursor: string | null; hasNextPage: boolean };
  totalCount: { value: number; isCapped: boolean };
}

export interface Category {
  slug: string;
  name: string;
  path: string;
  depth: number;
  isLeaf: boolean;
  parentSlug: string | null;
}

export interface Brand {
  slug: string;
  name: string;
}

export interface SizeChart {
  id: string;
  name: string;
  system: string;
  sizes: string[];
}

export interface Product {
  id: string;
  name: string;
  description: string;
  brand: { name: string };
  category: { slug: string; name: string };
  attributes: {
    materialComposition: { material: string; pct: number }[] | null;
    fit: string | null;
    pattern: string | null;
    neckline: string | null;
    sleeveLength: string | null;
    length: string | null;
    closure: string | null;
    careInstructions: string | null;
    heelHeightCm: number | null;
    upperMaterial: string | null;
    soleMaterial: string | null;
  };
  articles: {
    sku: string;
    colorName: string;
    colorFamily: ColorFamily;
    price: Price;
    sizes: { label: string; availability: SizeAvailability }[];
    images: Image[];
  }[];
}

const priceFields = 'currentCents originalCents discountPct';
const imageFields = 'kind url width height';

export function fetchArticles(filter: ArticleFilter, sort: ArticleSort, after: string | null) {
  return graphql<{ articles: ArticlePage }>(
    `query Articles($filter: ArticleFilter, $sort: ArticleSort, $after: String) {
      articles(filter: $filter, sort: $sort, first: 24, after: $after) {
        nodes {
          sku productName colorName availableSizes
          brand { name }
          price { ${priceFields} }
          image { ${imageFields} }
        }
        pageInfo { endCursor hasNextPage }
        totalCount { value isCapped }
      }
    }`,
    { filter, sort, after },
  ).then((data) => data.articles);
}

export function fetchReferenceData() {
  return graphql<{ categories: Category[]; brands: Brand[]; sizeCharts: SizeChart[] }>(`
    {
      categories {
        slug
        name
        path
        depth
        isLeaf
        parentSlug
      }
      brands {
        slug
        name
      }
      sizeCharts {
        id
        name
        system
        sizes
      }
    }
  `);
}

export function fetchProductByArticleSku(sku: string) {
  return graphql<{ productByArticleSku: Product | null }>(
    `query Product($sku: String!) {
      productByArticleSku(sku: $sku) {
        id name description
        brand { name }
        category { slug name }
        attributes {
          materialComposition { material pct }
          fit pattern neckline sleeveLength length closure careInstructions
          heelHeightCm upperMaterial soleMaterial
        }
        articles {
          sku colorName colorFamily
          price { ${priceFields} }
          sizes { label availability }
          images { ${imageFields} }
        }
      }
    }`,
    { sku },
  ).then((data) => data.productByArticleSku);
}
