# Query plans

`EXPLAIN (ANALYZE, BUFFERS)` for the listing queries, taken from the exact SQL the read API
builds (`buildArticleListSql`). Regenerate with:

```sh
cd app && DATABASE_URL=postgres://celestiea:celestiea@localhost:5432/celestiea pnpm explain
```

Environment: local Postgres 16 in Docker Desktop (4 vCPUs, 4 GB) on a 2017 Intel i7 MacBook
Pro, full seed, warm buffer cache, measured 2026-11-18.

## Summary

| Query                                       | Index used for the page                                          | Rows read to fill 25 | Time   |
| ------------------------------------------- | ---------------------------------------------------------------- | -------------------- | ------ |
| Whole catalog, popular                      | `articles_popular`                                               | 26                   | 0.9 ms |
| Leaf category, popular                      | `articles_category_popular`                                      | 28                   | 1.2 ms |
| Mid-level category (5 leaves), popular      | `articles_popular` + category filter                             | 501                  | 1.4 ms |
| Top-level category (63 leaves), popular     | `articles_popular` + category filter                             | 42                   | 1.1 ms |
| Leaf category, price range, price ascending | `articles_category_price`                                        | 25                   | 1.5 ms |
| Leaf category, brand + colour + size + sale | `articles_brand_category` bitmap, then `article_sizes_available` | 78 candidates        | 0.7 ms |
| Whole catalog, newest                       | `articles_newest`                                                | 26                   | 0.9 ms |
| Whole catalog, biggest discount             | `articles_discount`                                              | 26                   | 0.8 ms |
| Top-level category, page 41 via cursor      | `articles_popular`                                               | 62                   | 1.1 ms |

Notes:

- **Every page is served by walking one partial index in sort order and stopping after
  the limit.** No plan sorts the matching set; the only Sort nodes order the 25 page rows
  after the joins and the sizes inside `array_agg`.
- **Leaf categories** hit the `(category_id, sort key, id)` indexes because a single leaf is
  passed as `category_id = $1`, not `= ANY(...)`.
- **Parent categories** expand to several leaf ids, which a btree on `category_id` can't
  return in global sort order. The planner instead walks the global sort index and filters
  by category. That costs rows in proportion to how rare the category is: 42 rows for
  "women" (about 43% of the catalog), 501 for "dresses" (about 5%). It stays cheap down to
  roughly 1% of the catalog. For smaller parents the fix is denormalizing ancestor ids onto
  articles; it isn't needed at this size.
- **Combined filters** start from the brand index (three brands within the category, 78
  candidates) and check sizes with the partial `article_sizes_available` index.
- **Deep pages** cost the same as the first page with keyset pagination. The same
  top-level listing with `OFFSET` takes 18 ms at 3,840 rows and 141 ms at 38,400 rows,
  because Postgres reads and discards every skipped row
  ([ADR 0005](adr/0005-keyset-pagination.md)).
- The joins (product name, brand, first image, available sizes) run once per page row
  through primary keys and `article_sizes (article_id, size_label)`.

## Plans

Dataset: 302943 articles, 279239 listed; "women" expands to 63 leaf categories.

### Whole catalog, popular (home page)

`{}`

```text
Sort (actual time=0.643..0.647 rows=25 loops=1)
  Sort Key: a.popularity_score DESC, a.id DESC
  Sort Method: quicksort  Memory: 32kB
  Buffers: shared hit=305
  ->  Nested Loop Left Join (actual time=0.142..0.614 rows=25 loops=1)
        Buffers: shared hit=305
        ->  Nested Loop Left Join (actual time=0.110..0.361 rows=25 loops=1)
              Buffers: shared hit=204
              ->  Hash Join (actual time=0.088..0.236 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=104
                    ->  Nested Loop (actual time=0.039..0.176 rows=25 loops=1)
                          Buffers: shared hit=103
                          ->  Limit (actual time=0.022..0.062 rows=25 loops=1)
                                Buffers: shared hit=28
                                ->  Index Scan using articles_popular on articles a (actual time=0.022..0.059 rows=25 loops=1)
                                      Filter: in_stock
                                      Buffers: shared hit=28
                          ->  Memoize (actual time=0.004..0.004 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 0  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                Buffers: shared hit=75
                                ->  Index Scan using products_pkey on products p (actual time=0.003..0.003 rows=1 loops=25)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=75
                    ->  Hash (actual time=0.037..0.038 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.005..0.015 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.004..0.004 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.004..0.004 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.009..0.009 rows=1 loops=25)
              Buffers: shared hit=101
              ->  Sort (actual time=0.007..0.007 rows=6 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=101
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.004..0.005 rows=6 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=101
Planning:
  Buffers: shared hit=10
Planning Time: 0.761 ms
Execution Time: 0.869 ms
```

### Leaf category, popular

`{"filter":{"category":"women-clothing-dresses-maxi"}}`

```text
Sort (actual time=0.994..0.997 rows=25 loops=1)
  Sort Key: a.popularity_score DESC, a.id DESC
  Sort Method: quicksort  Memory: 31kB
  Buffers: shared hit=307
  ->  Nested Loop Left Join (actual time=0.201..0.960 rows=25 loops=1)
        Buffers: shared hit=307
        ->  Nested Loop Left Join (actual time=0.158..0.475 rows=25 loops=1)
              Buffers: shared hit=207
              ->  Hash Join (actual time=0.131..0.310 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=107
                    ->  Nested Loop (actual time=0.045..0.210 rows=25 loops=1)
                          Buffers: shared hit=106
                          ->  Limit (actual time=0.027..0.078 rows=25 loops=1)
                                Buffers: shared hit=31
                                ->  Index Scan using articles_category_popular on articles a (actual time=0.027..0.075 rows=25 loops=1)
                                      Index Cond: (category_id = '4'::bigint)
                                      Filter: in_stock
                                      Rows Removed by Filter: 3
                                      Buffers: shared hit=31
                          ->  Memoize (actual time=0.005..0.005 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 0  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                Buffers: shared hit=75
                                ->  Index Scan using products_pkey on products p (actual time=0.004..0.004 rows=1 loops=25)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=75
                    ->  Hash (actual time=0.074..0.074 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.006..0.043 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.006..0.006 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.005..0.005 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.019..0.019 rows=1 loops=25)
              Buffers: shared hit=100
              ->  Sort (actual time=0.013..0.013 rows=5 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=100
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.005..0.007 rows=5 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=100
Planning:
  Buffers: shared hit=10
Planning Time: 0.846 ms
Execution Time: 1.203 ms
```

### Mid-level category, popular

`{"filter":{"category":"women-clothing-dresses"}}`

```text
Sort (actual time=1.181..1.185 rows=25 loops=1)
  Sort Key: a.popularity_score DESC, a.id DESC
  Sort Method: quicksort  Memory: 31kB
  Buffers: shared hit=785
  ->  Nested Loop Left Join (actual time=0.134..1.108 rows=25 loops=1)
        Buffers: shared hit=785
        ->  Nested Loop Left Join (actual time=0.103..0.852 rows=25 loops=1)
              Buffers: shared hit=681
              ->  Hash Join (actual time=0.089..0.732 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=581
                    ->  Nested Loop (actual time=0.039..0.671 rows=25 loops=1)
                          Buffers: shared hit=580
                          ->  Limit (actual time=0.022..0.558 rows=25 loops=1)
                                Buffers: shared hit=505
                                ->  Index Scan using articles_popular on articles a (actual time=0.021..0.554 rows=25 loops=1)
                                      Filter: (in_stock AND (category_id = ANY ('{4,5,6,7,8}'::bigint[])))
                                      Rows Removed by Filter: 476
                                      Buffers: shared hit=505
                          ->  Memoize (actual time=0.004..0.004 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 0  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                Buffers: shared hit=75
                                ->  Index Scan using products_pkey on products p (actual time=0.003..0.003 rows=1 loops=25)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=75
                    ->  Hash (actual time=0.039..0.039 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.005..0.014 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.004..0.004 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.004..0.004 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.009..0.009 rows=1 loops=25)
              Buffers: shared hit=104
              ->  Sort (actual time=0.007..0.007 rows=5 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=104
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.004..0.005 rows=5 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=104
Planning:
  Buffers: shared hit=10
Planning Time: 0.719 ms
Execution Time: 1.363 ms
```

### Top-level category, popular

`{"filter":{"category":"women"}}`

```text
Sort (actual time=0.824..0.827 rows=25 loops=1)
  Sort Key: a.popularity_score DESC, a.id DESC
  Sort Method: quicksort  Memory: 32kB
  Buffers: shared hit=326
  ->  Nested Loop Left Join (actual time=0.188..0.794 rows=25 loops=1)
        Buffers: shared hit=326
        ->  Nested Loop Left Join (actual time=0.149..0.465 rows=25 loops=1)
              Buffers: shared hit=221
              ->  Hash Join (actual time=0.129..0.318 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=121
                    ->  Nested Loop (actual time=0.042..0.216 rows=25 loops=1)
                          Buffers: shared hit=120
                          ->  Limit (actual time=0.027..0.095 rows=25 loops=1)
                                Buffers: shared hit=45
                                ->  Index Scan using articles_popular on articles a (actual time=0.026..0.091 rows=25 loops=1)
                                      Filter: (in_stock AND (category_id = ANY ('{4,5,6,7,8,10,11,12,13,14,16,17,18,19,21,22,23,24,25,27,28,29,30,31,33,34,35,36,37,38,40,41,42,44,45,48,49,50,52,53,54,56,58,59,62,63,64,65,67,68,69,71,72,73,75,76,77,78,79,80,81,82,83}'::bigint[])))
                                      Rows Removed by Filter: 17
                                      Buffers: shared hit=45
                          ->  Memoize (actual time=0.004..0.004 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 0  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                Buffers: shared hit=75
                                ->  Index Scan using products_pkey on products p (actual time=0.003..0.003 rows=1 loops=25)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=75
                    ->  Hash (actual time=0.076..0.076 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.005..0.015 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.005..0.005 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.005..0.005 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.012..0.012 rows=1 loops=25)
              Buffers: shared hit=105
              ->  Sort (actual time=0.010..0.010 rows=5 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=105
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.006..0.007 rows=5 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=105
Planning:
  Buffers: shared hit=10
Planning Time: 1.080 ms
Execution Time: 1.060 ms
```

### Leaf category with price range, price ascending

`{"filter":{"category":"women-clothing-jeans-straight","minPriceCents":4000,"maxPriceCents":8000},"sort":"price_asc"}`

```text
Sort (actual time=1.301..1.305 rows=25 loops=1)
  Sort Key: a.price_cents, a.id
  Sort Method: quicksort  Memory: 32kB
  Buffers: shared hit=272
  ->  Nested Loop Left Join (actual time=0.363..1.258 rows=25 loops=1)
        Buffers: shared hit=272
        ->  Nested Loop Left Join (actual time=0.310..0.619 rows=25 loops=1)
              Buffers: shared hit=172
              ->  Hash Join (actual time=0.134..0.308 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=72
                    ->  Nested Loop (actual time=0.059..0.215 rows=25 loops=1)
                          Buffers: shared hit=71
                          ->  Limit (actual time=0.034..0.083 rows=25 loops=1)
                                Buffers: shared hit=20
                                ->  Index Scan using articles_category_price on articles a (actual time=0.032..0.079 rows=25 loops=1)
                                      Index Cond: ((category_id = '28'::bigint) AND (price_cents >= 4000) AND (price_cents <= 8000))
                                      Filter: in_stock
                                      Buffers: shared hit=20
                          ->  Memoize (actual time=0.004..0.004 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 8  Misses: 17  Evictions: 0  Overflows: 0  Memory Usage: 3kB
                                Buffers: shared hit=51
                                ->  Index Scan using products_pkey on products p (actual time=0.005..0.005 rows=1 loops=17)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=51
                    ->  Hash (actual time=0.058..0.059 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.010..0.024 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.011..0.012 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.011..0.011 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.024..0.025 rows=1 loops=25)
              Buffers: shared hit=100
              ->  Sort (actual time=0.017..0.017 rows=7 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=100
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.008..0.010 rows=7 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=100
Planning:
  Buffers: shared hit=10
Planning Time: 0.887 ms
Execution Time: 1.528 ms
```

### Leaf category, brand + colour + size + sale

`{"filter":{"category":"men-shoes-trainers-low-top","brands":["nordvik-studio","calder-supply","mirren-line"],"colors":["black","white"],"sizes":["EU 42"],"onSale":true}}`

```text
Nested Loop Left Join (actual time=0.314..0.448 rows=6 loops=1)
  Buffers: shared hit=133
  ->  Nested Loop Left Join (actual time=0.281..0.360 rows=6 loops=1)
        Buffers: shared hit=108
        ->  Nested Loop (actual time=0.264..0.315 rows=6 loops=1)
              Join Filter: (b.id = a.brand_id)
              Rows Removed by Join Filter: 148
              Buffers: shared hit=84
              ->  Nested Loop (actual time=0.253..0.277 rows=6 loops=1)
                    Buffers: shared hit=78
                    ->  Limit (actual time=0.238..0.240 rows=6 loops=1)
                          Buffers: shared hit=60
                          ->  Sort (actual time=0.237..0.238 rows=6 loops=1)
                                Sort Key: a.popularity_score DESC, a.id DESC
                                Sort Method: quicksort  Memory: 25kB
                                Buffers: shared hit=60
                                ->  Nested Loop Semi Join (actual time=0.072..0.227 rows=6 loops=1)
                                      Buffers: shared hit=60
                                      ->  Nested Loop (actual time=0.046..0.171 rows=6 loops=1)
                                            Buffers: shared hit=41
                                            ->  Seq Scan on brands (actual time=0.008..0.020 rows=3 loops=1)
                                                  Filter: (slug = ANY ('{nordvik-studio,calder-supply,mirren-line}'::text[]))
                                                  Rows Removed by Filter: 77
                                                  Buffers: shared hit=1
                                            ->  Bitmap Heap Scan on articles a (actual time=0.031..0.041 rows=2 loops=3)
                                                  Recheck Cond: ((brands.id = brand_id) AND (category_id = '121'::bigint) AND (deleted_at IS NULL) AND (status = 'active'::publication_status) AND (product_status = 'active'::publication_status))
                                                  Filter: (is_on_sale AND in_stock AND (color_family = ANY ('{black,white}'::color_family[])))
                                                  Rows Removed by Filter: 24
                                                  Heap Blocks: exact=31
                                                  Buffers: shared hit=40
                                                  ->  Bitmap Index Scan on articles_brand_category (actual time=0.017..0.017 rows=26 loops=3)
                                                        Index Cond: ((brand_id = brands.id) AND (category_id = '121'::bigint))
                                                        Buffers: shared hit=9
                                      ->  Index Only Scan using article_sizes_available on article_sizes s (actual time=0.008..0.008 rows=1 loops=6)
                                            Index Cond: ((size_label = ANY ('{"EU 42"}'::text[])) AND (article_id = a.id))
                                            Heap Fetches: 0
                                            Buffers: shared hit=19
                    ->  Index Scan using products_pkey on products p (actual time=0.005..0.005 rows=1 loops=6)
                          Index Cond: (id = a.product_id)
                          Buffers: shared hit=18
              ->  Seq Scan on brands b (actual time=0.002..0.003 rows=26 loops=6)
                    Buffers: shared hit=6
        ->  Limit (actual time=0.006..0.006 rows=1 loops=6)
              Buffers: shared hit=24
              ->  Index Scan using article_images_pkey on article_images i (actual time=0.006..0.006 rows=1 loops=6)
                    Index Cond: (article_id = a.id)
                    Buffers: shared hit=24
  ->  Aggregate (actual time=0.013..0.014 rows=1 loops=6)
        Buffers: shared hit=25
        ->  Sort (actual time=0.010..0.011 rows=6 loops=6)
              Sort Key: s_1.size_sort
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=25
              ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s_1 (actual time=0.006..0.008 rows=6 loops=6)
                    Index Cond: (article_id = a.id)
                    Filter: (availability <> 'out_of_stock'::size_availability)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=25
Planning:
  Buffers: shared hit=46
Planning Time: 2.018 ms
Execution Time: 0.707 ms
```

### Whole catalog, newest

`{"sort":"newest"}`

```text
Sort (actual time=0.646..0.649 rows=25 loops=1)
  Sort Key: a.released_at DESC, a.id DESC
  Sort Method: quicksort  Memory: 32kB
  Buffers: shared hit=245
  ->  Nested Loop Left Join (actual time=0.146..0.607 rows=25 loops=1)
        Buffers: shared hit=245
        ->  Nested Loop Left Join (actual time=0.113..0.275 rows=25 loops=1)
              Buffers: shared hit=143
              ->  Hash Join (actual time=0.096..0.189 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=43
                    ->  Nested Loop (actual time=0.045..0.126 rows=25 loops=1)
                          Buffers: shared hit=42
                          ->  Limit (actual time=0.028..0.058 rows=25 loops=1)
                                Buffers: shared hit=6
                                ->  Index Scan using articles_newest on articles a (actual time=0.027..0.054 rows=25 loops=1)
                                      Filter: in_stock
                                      Buffers: shared hit=6
                          ->  Memoize (actual time=0.002..0.002 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 13  Misses: 12  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                Buffers: shared hit=36
                                ->  Index Scan using products_pkey on products p (actual time=0.003..0.003 rows=1 loops=12)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=36
                    ->  Hash (actual time=0.039..0.039 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.006..0.016 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.003..0.003 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.002..0.002 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.012..0.012 rows=1 loops=25)
              Buffers: shared hit=102
              ->  Sort (actual time=0.008..0.009 rows=5 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=102
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.003..0.004 rows=5 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=102
Planning:
  Buffers: shared hit=10
Planning Time: 0.744 ms
Execution Time: 0.942 ms
```

### Whole catalog, biggest discount

`{"sort":"discount"}`

```text
Sort (actual time=0.607..0.611 rows=25 loops=1)
  Sort Key: a.discount_pct DESC, a.id DESC
  Sort Method: quicksort  Memory: 31kB
  Buffers: shared hit=306
  ->  Nested Loop Left Join (actual time=0.139..0.587 rows=25 loops=1)
        Buffers: shared hit=306
        ->  Nested Loop Left Join (actual time=0.108..0.345 rows=25 loops=1)
              Buffers: shared hit=204
              ->  Hash Join (actual time=0.093..0.236 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=104
                    ->  Nested Loop (actual time=0.042..0.174 rows=25 loops=1)
                          Buffers: shared hit=103
                          ->  Limit (actual time=0.023..0.067 rows=25 loops=1)
                                Buffers: shared hit=28
                                ->  Index Scan using articles_discount on articles a (actual time=0.023..0.064 rows=25 loops=1)
                                      Filter: in_stock
                                      Rows Removed by Filter: 1
                                      Buffers: shared hit=28
                          ->  Memoize (actual time=0.004..0.004 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 0  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                Buffers: shared hit=75
                                ->  Index Scan using products_pkey on products p (actual time=0.003..0.003 rows=1 loops=25)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=75
                    ->  Hash (actual time=0.039..0.039 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.007..0.016 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.004..0.004 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.003..0.003 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.009..0.009 rows=1 loops=25)
              Buffers: shared hit=102
              ->  Sort (actual time=0.007..0.007 rows=5 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=102
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.004..0.005 rows=5 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=102
Planning:
  Buffers: shared hit=10
Planning Time: 0.819 ms
Execution Time: 0.806 ms
```

### Top-level category, page 41 (after 3,840 rows)

`{"filter":{"category":"women"},"sort":"popular","after":"(cursor)"}`

```text
Sort (actual time=0.873..0.877 rows=25 loops=1)
  Sort Key: a.popularity_score DESC, a.id DESC
  Sort Method: quicksort  Memory: 32kB
  Buffers: shared hit=342
  ->  Nested Loop Left Join (actual time=0.143..0.848 rows=25 loops=1)
        Buffers: shared hit=342
        ->  Nested Loop Left Join (actual time=0.108..0.559 rows=25 loops=1)
              Buffers: shared hit=241
              ->  Hash Join (actual time=0.091..0.429 rows=25 loops=1)
                    Hash Cond: (a.brand_id = b.id)
                    Buffers: shared hit=141
                    ->  Nested Loop (actual time=0.045..0.369 rows=25 loops=1)
                          Buffers: shared hit=140
                          ->  Limit (actual time=0.027..0.239 rows=25 loops=1)
                                Buffers: shared hit=65
                                ->  Index Scan using articles_popular on articles a (actual time=0.026..0.235 rows=25 loops=1)
                                      Index Cond: (ROW(popularity_score, id) < ROW(440, '145592'::bigint))
                                      Filter: (in_stock AND (category_id = ANY ('{4,5,6,7,8,10,11,12,13,14,16,17,18,19,21,22,23,24,25,27,28,29,30,31,33,34,35,36,37,38,40,41,42,44,45,48,49,50,52,53,54,56,58,59,62,63,64,65,67,68,69,71,72,73,75,76,77,78,79,80,81,82,83}'::bigint[])))
                                      Rows Removed by Filter: 37
                                      Buffers: shared hit=65
                          ->  Memoize (actual time=0.005..0.005 rows=1 loops=25)
                                Cache Key: a.product_id
                                Cache Mode: logical
                                Hits: 0  Misses: 25  Evictions: 0  Overflows: 0  Memory Usage: 4kB
                                Buffers: shared hit=75
                                ->  Index Scan using products_pkey on products p (actual time=0.004..0.004 rows=1 loops=25)
                                      Index Cond: (id = a.product_id)
                                      Buffers: shared hit=75
                    ->  Hash (actual time=0.036..0.036 rows=80 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 14kB
                          Buffers: shared hit=1
                          ->  Seq Scan on brands b (actual time=0.005..0.015 rows=80 loops=1)
                                Buffers: shared hit=1
              ->  Limit (actual time=0.005..0.005 rows=1 loops=25)
                    Buffers: shared hit=100
                    ->  Index Scan using article_images_pkey on article_images i (actual time=0.004..0.004 rows=1 loops=25)
                          Index Cond: (article_id = a.id)
                          Buffers: shared hit=100
        ->  Aggregate (actual time=0.011..0.011 rows=1 loops=25)
              Buffers: shared hit=101
              ->  Sort (actual time=0.008..0.009 rows=6 loops=25)
                    Sort Key: s.size_sort
                    Sort Method: quicksort  Memory: 25kB
                    Buffers: shared hit=101
                    ->  Index Scan using article_sizes_article_id_size_label_key on article_sizes s (actual time=0.004..0.006 rows=6 loops=25)
                          Index Cond: (article_id = a.id)
                          Filter: (availability <> 'out_of_stock'::size_availability)
                          Rows Removed by Filter: 0
                          Buffers: shared hit=101
Planning:
  Buffers: shared hit=10
Planning Time: 0.962 ms
Execution Time: 1.073 ms
```
