# 0009: Cross-region plan (not built)

## Context

Everything runs in eu-north-1 (Stockholm). If traffic becomes international, or a regional outage
must not take the shop down, a second region is needed.

## Plan

1. **Reads go global first.** CloudFront already serves the UI and cached GraphQL from edge
   locations worldwide. The first step needs no new region at all: longer cache lifetimes
   and origin shield cut the trips back to Stockholm.
2. **Aurora Global Database**: a secondary cluster in the second region (for example
   us-east-1) with storage-level replication, typically under one second of lag. The
   secondary's reader serves that region's read API.
3. **Read API per region**: the same Terraform modules instantiated per region
   (`envs/prod-eu`, `envs/prod-us`), each with its own ECS service, ALB, API Gateway and
   Valkey. CloudFront gets an origin group or a latency-based Route 53 record in front of
   the regional APIs.
4. **Writes stay single-region** (the Aurora primary). The secondary region's API Gateway
   routes writes to the primary region's Lambda, or to a local Lambda that forwards via
   Aurora's write forwarding. Catalog writes are rare, so the extra latency for admins is
   acceptable, and single-writer avoids conflict resolution.
5. **Failover**: Aurora Global Database managed failover promotes the secondary (RPO
   around a second, RTO minutes). The write Lambda is deployed in both regions so it can
   take over after promotion.
6. **Cache invalidation across regions**: the write path publishes "product changed"
   events (the same transactional outbox the search projection would use) and each
   region's consumer overwrites its Valkey entry.

## Consequences

Roughly doubles the fixed cost. It adds a second set of state and deployments, and
replication lag becomes visible between regions. Worth it only when latency outside Europe
or availability targets justify it.
