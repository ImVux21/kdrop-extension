# 08-backup-and-test-suite

Status: closed
Labels: backup, testing, verification

Blocked by: 03, 04, 05, 07

## Description
Extend export/import to support versioned complete product dossier backups while maintaining backward compatibility with legacy JSON array backups. Implement an automated native Node.js test suite covering migration, preservation, unknown data, financial calculations, eligibility criteria, quote verification, backup roundtripping, and CSP compliance.

## Acceptance Criteria
- [x] Export generates a versioned backup object `{ version: 2, exportedAt, products, ... }` containing full dossiers, watchlist, and provenance.
- [x] Import supports both versioned backups and legacy arrays (treating legacy records with conservative provenance).
- [x] Malformed imports fail cleanly without altering or corrupting existing records.
- [x] Automated test suite passes all acceptance criteria:
  - Migration idempotence and preservation of manual edits / watchlists.
  - Rescan preservation across single and batch operations.
  - Correct handling of unknown data (no fabricated values).
  - Eligibility state rules (85-point KC, 56.5-point negative margin, full passing dossier, missing evidence).
  - Profile boundary tests (10k searches, 70% rocket share, 30 seller reviews, price tiers, 25% margin).
  - Economics tests (heavy products, zero vs missing, simulator baseline vs scenario).
  - Backup/restore roundtrip fidelity.

## Comments
- Implemented `exportBackup()` and `importBackup()` in `storage/storageRepository.js`.
- Implemented automated regression test suite across 6 files:
  - `tests/migration.test.js`
  - `tests/preservation.test.js`
  - `tests/eligibility.test.js`
  - `tests/economics.test.js`
  - `tests/backup.test.js`
  - `tests/extractor.test.js`
  - `tests/csp.test.js`
- All 19 tests passing synchronously via `node --test tests/*.test.js`.
