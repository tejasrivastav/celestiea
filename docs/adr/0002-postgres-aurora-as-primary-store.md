# 0002: PostgreSQL (Aurora in prod) as the primary store

## Context

A few hundred thousand listed articles, millions of size rows, reads far above writes,
filters on category, brand, colour, size and price, and category-specific attributes.

## Options

- **DynamoDB**: predictable latency and no servers, but each filter-and-sort combination
  needs its own access pattern or index, ranges on price combined with category are
  awkward, and keyset pagination over arbitrary filters is not natural.
- **Document store** (MongoDB, DocumentDB): flexible attributes, but the aggregate and
  listing still need joins-like lookups and the same index planning.
- **Relational (PostgreSQL)**: composite and partial indexes fit "filter, sort, page"
  exactly; transactions keep the product, its articles and their copied columns
  consistent; JSONB holds category-specific attributes; `ltree` models the category tree.

## Decision

PostgreSQL 16. In prod, **Aurora PostgreSQL Serverless v2** with a writer and one reader:
storage is replicated across AZs, the reader endpoint serves the read API, capacity scales
in 0.5 ACU steps, and adding readers needs no data copy. Plain RDS was the alternative;
Aurora wins on reader lag (shared storage) and failover time. The free-tier dev
environment uses a single RDS db.t4g.micro ([0007](0007-terraform-and-repo-separation.md)).

Attributes live in JSONB and are **not indexed**. Filtering and facet counts on arbitrary
attributes is the trigger to add a search engine, not more Postgres indexes.

## Facets (not built)

A `facets(category)` query with brand, colour and size counts is possible with grouped
aggregates over the category's articles. It is cheap for one category but not for
arbitrary filter combinations, because each combination needs its own counts over the
whole match set. That is what OpenSearch or Typesense are built for; see the scaling
path in the README.

## Consequences

Relational modelling and indexes are designed up front. Aurora has a minimum cost even
when idle (0.5 ACU per instance) and scale-to-zero does not apply while the read API keeps
connections open.
