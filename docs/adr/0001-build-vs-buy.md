# 0001: Build vs. buy

## Context

The assignment asks for a product catalog API. In a real company the first question is
whether to build one at all.

## Options

- **SaaS commerce** (Shopify Plus, BigCommerce, commercetools): catalog, checkout and admin
  out of the box; per-order or GMV fees, API rate limits, and a data model you adapt to.
- **Open-source engines** (Medusa, Saleor, Vendure): own the hosting, keep the model
  extensible, inherit the engine's upgrade path and opinions.
- **Search services** (Algolia, Typesense, Meilisearch) for listing and facets, with any of
  the above as the source of truth.
- **Build** the catalog service.

## Decision

In production I would start by evaluating SaaS or an open-source engine, plus a search
service. Building is justified when the catalog is a differentiator: a marketplace with
many sellers, rich category-specific attributes, custom ranking, or ERP feeds large enough
to hit SaaS write rate limits. It is also justified when platform fees and lock-in cost
more than a small team maintaining the service.

This repository builds the catalog because the assignment asks for it.

## Consequences

The build covers only catalog reads and writes. Checkout, inventory, pricing rules and
search relevance, which a platform would bring along, are out of scope and listed as
limitations in the README.
