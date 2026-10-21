# K-Drop v1.0.1: background recovery and sequential category scans

Date: 2026-10-12

## User symptoms and evidence

- The user still sees the old homepage message claiming only advertising banners. That exact message is absent from the current workspace source. The user's loaded extension folder/version has not been confirmed; stale tab scripts or a different unpacked copy remain possible.
- The user reports `The message port closed before a response was received` while importing category 184060. The storage client previously passed that transport failure directly to the UI without recovery.
- Read-only live DOM inspection of https://www.coupang.com/np/categories/184060 succeeded in the connected in-app browser. It showed 60 ProductUnit cards and a Pagination component with observed `?page=2` links. The first captured prices were 2500, 7500 and 3010 KRW. Product IDs are from links even though card `data-id` is `0`; used prices, unit prices and reward amounts have separate DOM roles.
- A minimized observed DOM fixture is stored in `tests/fixtures/coupang-category-184060.html`. This is a capture of supported structure, not proof that every product/page layout works.

## Changes

- The service worker handles a health check and responds to synchronous/asynchronous mutation failures through the same message channel.
- On a connection failure, the storage client retries only `batchImportProducts`, once, after a healthy worker response. Batch import is an upsert by Product ID and preserves MANUAL/EVIDENCE dossiers, so retrying a committed batch whose reply was lost is safe. Toggle and other non-idempotent actions are never replayed.
- Persistent/stale-context failures include instructions to check the unpacked extension folder, Reload in chrome://extensions, F5 Coupang and reopen sidepanel. Actual storage failures remain visible and are not retried as transport errors.
- The manifest version is 1.0.1, shown in the sidepanel header and floating-bar tooltip. This identifies whether Chrome loaded the patched build.
- Sidepanel adds sequential page scanning from the current category/search page, with a per-run limit of 5/10/25/50/100 pages, progress and Stop. Each page commits before the next navigation. Cross-page duplicates upsert existing products.
- Pagination follows only observed next-page links from a supported pagination component. Origin, category/search path, filters and sort must stay the same; page number must increment by one. The loop stops on the last supported page, the configured limit, cancellation, unsupported/empty pages, storage error or navigation/context failure. It never claims all pages were scanned when stopped by a limit or unsupported paging.
- No background crawling, private endpoint calls or access-control bypass is introduced. BSR remains unknown, including sales-sort listings.

## Checks

- `node --test tests/*.test.js`: 57 passed, 0 failed.
- `node .scratch/coupang-scan-fix/verification/run-gate.cjs`: 38 passed, 0 failed in installed Chrome MV3, disposable profile.
- `node tests/installed_category_runtime_gate.cjs`: 27 checks passed, including both category buttons, a cold-started worker, a lost acknowledgment after a genuine commit, dossier preservation, Studio reload, last-page detection, limit, cancellation, external-link rejection and sort preservation.
- The lost-acknowledgment case intentionally stalls the reply after a real repository commit, then closes that worker target. Recovery must produce a real subsequent response and preserve exactly three products, with no duplicate record. This is controlled fault injection of the user's transport symptom; it does not establish why the user's original worker disconnected.
- `category-pagination.png` in the original scan verification directory shows the installed test sidepanel at v1.0.1 after three fixture pages committed seven distinct products.

## Rollout boundary

The user's regular Chrome profile is not connected to the available browser controller, so its loaded K-Drop folder/version and live import have not been inspected or reloaded here. The patch and installed test environment are verified; the user must reload the same unpacked extension and refresh Coupang, then check the v1.0.1 header. Do not uninstall the old extension or clear its storage to update it.
