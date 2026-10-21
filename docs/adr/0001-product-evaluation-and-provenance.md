# ADR 0001: Product Data Provenance and Trial Selling Eligibility

## Status
Accepted

## Context
K-Drop Studio helps operators research 1688 -> Coupang buy-per-order cross-border dropshipping. In the initial extension version, Diamond/Gold/Silver labels were derived from unverified or heuristic data, sometimes leading to false positives (e.g. KC-risk products marked Diamond, negative margin products marked Silver). Furthermore, rescanning Coupang products overwrote manually entered 1688 costs and watchlist states, and inline event handlers caused CSP issues under Chrome Extension MV3.

## Decision
1. **Schema & Provenance**: Adopt a versioned product schema with explicit provenance categories (`OBSERVED`, `HEURISTIC`, `MANUAL`, `EVIDENCE`, `LEGACY`). Sourcing quotes and research evidence require operator attestation and source metadata.
2. **Separation of Scoring & Trial Eligibility**: Separate the heuristic screening score (WPI) from trial selling eligibility evaluation. Trial selling eligibility evaluates to one of 3 states: `needs_verification`, `not_eligible`, or `ready_for_trial`. High WPI cannot bypass blocking conditions or missing evidence.
3. **Rescan Preservation**: Rescanning retains manual sourcing inputs, evidence dossier, watchlist membership, and internal ID, while refreshing observed Coupang market fields.
4. **Shared Financial Model**: Financial calculations unify all operating costs (supplier cost, shipping, commission, buying-agent fees, ads, returns) and distinguish explicit zero from missing values.
5. **CSP Compliance**: Eliminate all inline scripts and event attributes (`onclick`, `onchange`), replacing them with standard DOM event listeners and safe rendering APIs.

## Consequences
- Operator decisions are backed by traceable evidence and explicit verification.
- Products cannot be falsely declared "ready for trial" without passing all criteria and safety reviews.
- Saved user data is protected against overwrites during market rescans.
- Complies strictly with Chrome Extension Manifest V3 Content Security Policy.
