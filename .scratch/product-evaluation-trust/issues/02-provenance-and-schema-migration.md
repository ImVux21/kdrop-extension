# 02-provenance-and-schema-migration

Status: closed
Labels: data-model, storage, schema

Blocked by: 

## Description
Introduce a versioned product schema with structured observation metadata, user-owned sourcing inputs, economic assumptions, research evidence dossier, and derived assessment fields. Implement an idempotent migration module to upgrade existing products from `kdrop_products` and `initial_data.json` without data loss.

## Acceptance Criteria
- [x] Schema defines explicit provenance categories: `OBSERVED`, `HEURISTIC`, `MANUAL`, `EVIDENCE`, `LEGACY`.
- [x] Legacy records retain original product ID, `cogs1688Cny`, `isWatchlist`, and category grouping while marking unverified values as `LEGACY`.
- [x] Migration function is idempotent: running it multiple times preserves data integrity and does not duplicate or corrupt records.
- [x] Product identity strictly uses non-empty `productId`. Vendor item IDs are stored as offer references, not proof of Buy Box ownership.

## Comments
- Implemented `SCHEMA_VERSION = 2` in `storage/storageRepository.js` with structured metadata for market observation, sourcing dossier, economics, and evidence dossier.
- Provenance categories implemented (`OBSERVED`, `HEURISTIC`, `MANUAL`, `EVIDENCE`, `LEGACY`).
- Idempotence and legacy retention verified by `tests/migration.test.js`.
