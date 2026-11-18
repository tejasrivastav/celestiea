import type {
  ColorFamily,
  ImageKind,
  PublicationStatus,
  SizeAvailability,
  SizeSystem,
  TargetGroup,
} from './catalog';

export interface Price {
  currentCents: number;
  originalCents: number | null;
  discountPct: number;
  currency: string;
}

export interface Image {
  kind: ImageKind;
  url: string;
  width: number;
  height: number;
}

export interface Brand {
  slug: string;
  name: string;
  isPremium: boolean;
}

export interface ArticleTile {
  id: number;
  sku: string;
  productId: number;
  productName: string;
  brand: Brand;
  colorName: string;
  colorFamily: ColorFamily;
  price: Price;
  image: Image | null;
  availableSizes: string[];
}

export interface MaterialShare {
  material: string;
  pct: number;
}

export interface ProductAttributes {
  materialComposition?: MaterialShare[];
  fit?: string;
  pattern?: string;
  neckline?: string;
  sleeveLength?: string;
  length?: string;
  closure?: string;
  careInstructions?: string;
  heelHeightCm?: number;
  upperMaterial?: string;
  soleMaterial?: string;
  season?: string;
}

export interface ArticleView {
  sku: string;
  colorName: string;
  colorFamily: ColorFamily;
  price: Price;
  status: PublicationStatus;
  inStock: boolean;
  sizes: { label: string; availability: SizeAvailability; gtin: string }[];
  images: Image[];
}

export interface ProductView {
  id: number;
  modelSku: string;
  name: string;
  description: string;
  status: PublicationStatus;
  version: number;
  targetGroup: TargetGroup;
  attributes: ProductAttributes;
  sustainability: string[];
  brand: Brand;
  category: { slug: string; name: string; path: string };
  sizeSystem: SizeSystem | null;
  updatedAt: string;
  articles: ArticleView[];
}

// Shoppers only see active products and their active colours. Drafts, archived products
// and products without a visible colour behave as if they did not exist.
export function toPublicProductView(view: ProductView): ProductView | null {
  if (view.status !== 'active') {
    return null;
  }
  const articles = view.articles.filter((article) => article.status === 'active');
  if (articles.length === 0) {
    return null;
  }
  return { ...view, articles };
}
