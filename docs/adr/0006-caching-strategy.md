# 0006: Caching

## Context

Most traffic is anonymous listing and product pages. The goal is to keep it off the
database without serving very stale prices, and without per-write cache invalidation
costs.

## Decision

Three layers, each for what it is good at:

1. **CloudFront** caches GraphQL `GET` responses by full URL for the lifetime the read API
   sets in `Cache-Control`: 30 s for listings, 60 s for product detail, 1 h for
   categories, brands and size charts. A query mixing root fields gets the shortest one.
   Errors are `no-store`. **Writes never create CloudFront invalidations** (they cost money
   past 1,000 paths per month and are rate limited). Every lifetime comes with a 10 s
   `stale-while-revalidate`, so after expiry CloudFront keeps answering from cache while
   it refetches in the background, and hot keys never send a burst of misses to the
   origin. The cost is that **a shopper can see a price up to 70 s old** (60 s fresh
   plus 10 s stale). That is the accepted staleness window. Only `/index.html` is invalidated on
   UI deploys; hashed assets are immutable.
2. **Valkey** (prod) caches product views by id for 5 minutes. After commit the write
   Lambda **overwrites** the entry with the new view, and the read API only fills missing
   entries (`SET NX`). Deleting the key instead would let a read that hits a lagging
   replica put the old view straight back. For the same reason a deleted product is not
   evicted but replaced by a **tombstone** for the entry's lifetime, which reads treat as
   "not found" and fills cannot overwrite. Valkey errors never fail a request; reads fall
   back to Postgres. `enable_cache = false`, and the dev environment, run without it.
3. **In-process memory** in each read task holds categories, brands and size charts for
   5 minutes. They change rarely and appear on every page. Product data is not cached in
   process, because the write Lambda can't invalidate it.

Listings are not cached in Valkey: filter and cursor combinations make the hit rate low,
and the database answers them in about 1 ms.

`ETag`s from the read API (a hash of the response) let browsers and CloudFront revalidate
with `304`. They differ from the write API's version ETags used for `If-Match`.

## Consequences

Freshness differs by path. A shopper can be up to 70 s behind through CloudFront; a
direct read is fresh apart from replica lag; the admin sees its own writes immediately.
A cache layer can be turned off without code changes.
