# 03-preservation-and-lifecycle

Status: closed
Labels: storage, lifecycle

Blocked by: 02

## Description
Refactor `storageRepository.js` to ensure that manual sourcing inputs, watchlist membership, evidence dossier, and internal IDs are strictly preserved when rescanning existing products or importing batches. Ensure serialized storage mutation, error handling (no false success notices on write failures), and broadcast notifications to open extension views.

## Acceptance Criteria
- [x] Rescanning a product updates observed Coupang fields (price, title, thumbnail) while preserving user-entered 1688 cost, watchlist state, internal ID, and evidence dossier.
- [x] A new scan never overwrites a manual price with a heuristic estimate or downgrades provenance/verification status.
- [x] Rescan retains research grouping when refreshing market observations.
- [x] Storage failures reject cleanly and do not show false success notifications.
- [x] Notify open views (`chrome.runtime.sendMessage` with `KDROP_STORAGE_UPDATED`) upon completed updates.

## Comments
- Implemented `mergeScannedProduct` in `storage/storageRepository.js` preserving user-owned fields (`sourcingDossier`, `isWatchlist`, `economics`, `evidenceDossier`, `id`).
- Implemented atomic mutation queue `serializeMutation` preventing concurrent storage writes.
- Verified in `tests/preservation.test.js` covering single product rescan, batch rescan, and concurrent edits.
