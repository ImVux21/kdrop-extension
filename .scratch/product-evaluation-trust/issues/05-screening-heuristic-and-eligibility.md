# 05-screening-heuristic-and-eligibility

Status: closed
Labels: core, wpi, eligibility

Blocked by: 04

## Description
Separate the screening priority heuristic (Winning Product Index - WPI) from the trial selling eligibility evaluation ("Điều kiện thử bán"). WPI must only show complete numeric scores when all inputs are present and mark provisional status when based on estimates. Implement the research profile trial eligibility evaluator with 3 states (`needs_verification`, `not_eligible`, `ready_for_trial`) based on strict criteria (search volume >= 10,000, Rocket share < 70%, seller reviews >= 30, price criteria, baseline margin >= 25%, sourcing quote verification, KC risk review).

## Acceptance Criteria
- [x] WPI displays as provisional when based on estimated or unverified inputs. When components are unknown, show available breakdown and missing list rather than fabricated points.
- [x] Final trial eligibility evaluates to one of 3 states: `needs_verification` ("Cần xác minh"), `not_eligible` ("Chưa đạt điều kiện"), or `ready_for_trial` ("Đủ điều kiện thử bán").
- [x] High WPI score NEVER overrides `not_eligible` or `needs_verification`.
- [x] High KC risk product (e.g. 85 score) cannot be ready for trial without documented KC review evidence.
- [x] Negative margin product (e.g. 56.5 score) is strictly `not_eligible`.
- [x] Profile boundaries:
  - Peak monthly search volume: >= 10,000 passes, < 10,000 fails.
  - Rocket share: < 70% in documented sample passes, >= 70% fails.
  - Seller reviews: >= 30 for comparable international delivery offer passes, < 30 fails. Product reviews alone do NOT satisfy seller review requirement.
  - Target price: >= 100,000 KRW passes; 50,000 - 99,999 KRW requires documented economic review; < 50,000 KRW fails.
  - Complete margin: >= 25% passes, < 25% fails.

## Comments
- Implemented `calculateWinningProductIndex` with `isProvisional` and missing component tracking in `core/winAlgorithm.js`.
- Implemented `evaluateTrialEligibility` with the 3 canonical states and exact profile boundaries.
- Verified in `tests/eligibility.test.js`.
