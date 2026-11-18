// Enum values use the same lower snake_case spelling as the database and the REST write
// API, so a value means the same thing on every surface without a mapping layer.
export const schema = /* GraphQL */ `
  type Query {
    articles(
      filter: ArticleFilter
      sort: ArticleSort = popular
      first: Int = 24
      after: String
    ): ArticleConnection!
    product(id: ID!): Product
    productByArticleSku(sku: String!): Product
    categories: [Category!]!
    brands: [Brand!]!
    sizeCharts: [SizeChart!]!
  }

  input ArticleFilter {
    "Category slug; includes all descendant categories."
    category: String
    "Brand slugs."
    brands: [String!]
    colors: [ColorFamily!]
    "Size labels; matches articles with at least one of them available."
    sizes: [String!]
    "Inclusive, in euro cents."
    minPriceCents: Int
    "Inclusive, in euro cents."
    maxPriceCents: Int
    targetGroup: TargetGroup
    onSale: Boolean
    inStock: Boolean = true
  }

  enum ArticleSort {
    popular
    price_asc
    price_desc
    newest
    "Sale items only, highest discount first."
    discount
  }

  enum ColorFamily {
    black
    white
    grey
    blue
    navy
    red
    pink
    green
    khaki
    beige
    brown
    yellow
    orange
    purple
    multicolour
  }

  enum TargetGroup {
    women
    men
    kids_girls
    kids_boys
    unisex
  }

  enum SizeAvailability {
    in_stock
    low_stock
    out_of_stock
  }

  enum SizeSystem {
    alpha
    eu_shoe
    jeans
    kids_height
    one_size
  }

  enum ImageKind {
    packshot
    model
    detail
  }

  type ArticleConnection {
    nodes: [ArticleTile!]!
    pageInfo: PageInfo!
    "Capped count; isCapped means there are more matches than value."
    totalCount: TotalCount!
  }

  type PageInfo {
    endCursor: String
    hasNextPage: Boolean!
  }

  type TotalCount {
    value: Int!
    isCapped: Boolean!
  }

  type ArticleTile {
    sku: String!
    productId: ID!
    productName: String!
    brand: Brand!
    colorName: String!
    colorFamily: ColorFamily!
    price: Price!
    image: Image
    availableSizes: [String!]!
  }

  type Price {
    currentCents: Int!
    "Set when the article is on sale."
    originalCents: Int
    discountPct: Int!
    currency: String!
  }

  type Image {
    kind: ImageKind!
    url: String!
    width: Int!
    height: Int!
  }

  type Brand {
    slug: String!
    name: String!
    isPremium: Boolean!
  }

  type Product {
    id: ID!
    modelSku: String!
    name: String!
    description: String!
    targetGroup: TargetGroup!
    attributes: ProductAttributes!
    sustainability: [String!]!
    brand: Brand!
    category: CategoryRef!
    sizeSystem: SizeSystem
    "Aggregate version; send it as If-Match when updating the product."
    version: Int!
    articles: [Article!]!
  }

  type ProductAttributes {
    materialComposition: [MaterialShare!]
    fit: String
    pattern: String
    neckline: String
    sleeveLength: String
    length: String
    closure: String
    careInstructions: String
    heelHeightCm: Int
    upperMaterial: String
    soleMaterial: String
    season: String
  }

  type MaterialShare {
    material: String!
    pct: Int!
  }

  type Article {
    sku: String!
    colorName: String!
    colorFamily: ColorFamily!
    price: Price!
    inStock: Boolean!
    "Ordered by the size chart."
    sizes: [Size!]!
    images: [Image!]!
  }

  type Size {
    label: String!
    availability: SizeAvailability!
    gtin: String!
  }

  type CategoryRef {
    slug: String!
    name: String!
    path: String!
  }

  type SizeChart {
    id: ID!
    name: String!
    system: SizeSystem!
    "In size order."
    sizes: [String!]!
  }

  type Category {
    slug: String!
    name: String!
    path: String!
    depth: Int!
    isLeaf: Boolean!
    parentSlug: String
  }
`;
