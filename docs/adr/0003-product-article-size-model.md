# 0003: Product, colour article, size model

## Context

Fashion retailers list one tile per colour, not per style. A "relaxed fit denim jacket"
in three washes is one product with three listing tiles, each with its own price, sale
status and images, and each sold in several sizes.

## Decision

- `products`: the style, with name, brand, leaf category, attributes and status.
- `articles`: one colour of a product. **The unit of listing, filtering and pricing.**
- `article_sizes`: the purchasable SKU with GTIN and availability, ordered by
  `size_sort` from the size chart (S < M < L, not alphabetical).
- `size_charts` define valid sizes per product; the write API rejects sizes outside it.

The listing filters need product-level columns (brand, category, target group, status).
Joining `products` for every listing would rule out a single composite index for
"filter, sort, page", so `brand_id`, `category_id`, `target_group` and `product_status`
are **copied onto articles**. Every product write updates them in the same transaction.
An article also keeps its own `status`, so archiving one colour doesn't affect the
others; listing requires both to be active. A test checks that the copies stay in sync.

`products.version` is the **aggregate version**: any change to the product, its articles
or sizes increments it. It is the `If-Match` value for writes, and every write locks the
product row first, so concurrent writes to one product are serialized.

## Consequences

Listing queries touch only `articles` until the final page is joined. The cost is write
amplification: changing a product's category rewrites all its articles (at most 20). That
is acceptable for a read-heavy catalog. A missed update would be a correctness bug, which
is why the copy happens in one repository function inside the same transaction.
