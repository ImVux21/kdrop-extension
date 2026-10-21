# 06-extraction-and-badge-updates

Status: closed
Labels: content-script, extraction, badge

Blocked by: 01, 05

## Description
Refactor Coupang DOM extractors in `coupang_extractor.js` to eliminate fabricated ranks (rank: 1), ratings (4.8), and review counts (100). Record search listing position as listing position with page context rather than verified BSR. Update in-page floating badge in `inpage_badge.js` to render trial eligibility status, provisional indicator, and clear unknown values.

## Acceptance Criteria
- [x] `extractSingleProduct()` returns `null` or unknown for missing fields without inventing default 4.8 rating, 100 reviews, or rank 1.
- [x] Detail page without price or valid product ID produces a clear scan result/error rather than a fake product.
- [x] Listing extractor records search listing position with collection time context; does not treat standard search order as verified BSR.
- [x] Content script badge shows screening score, provisional badge if estimated, and trial eligibility state.
- [x] Button handlers and UI elements in badge use registered listeners without inline scripts.

## Comments
- Eliminated all hardcoded fake ranks/ratings in `content/coupang_extractor.js`.
- Refactored `content/inpage_badge.js` with trial eligibility badge, provisional WPI display, and CSP compliance.
- Verified in `tests/extractor.test.js` and `tests/csp.test.js`.
