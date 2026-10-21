# K-Drop Studio: Hoàn thiện Product Evaluation Trust sau review vòng hai

Status: ready-for-agent
Labels: ready-for-agent
Date: 2026-10-12
Testing seams: kế thừa storage lifecycle và installed Chrome extension đã được người dùng xác nhận
Previous corrective spec: ../product-evaluation-trust-remediation/spec.md
Original spec: ../product-evaluation-trust/spec.md
Implementation feedback: ./implementation-feedback.md

## Problem Statement

Bản cập nhật đã sửa nhiều vấn đề của vòng đầu: KC LOW không tự pass, quét lại giữ target price, restore có logic riêng, sửa giá vốn hủy verification và margin được so sánh trước làm tròn. Tuy nhiên, người vận hành vẫn có thể nhận kết luận hoặc con số tài chính sai, đặc biệt với hồ sơ schema v2 đã lưu từ bản trước.

Review vòng hai ghi nhận 9 findings F01–F09. Các ca tái hiện cho thấy assessment cũ vẫn được tin khi đọc/import; migration có thể ghi đè một edit vừa thành công; restore báo lỗi nhưng vẫn đổi products; chi phí thiếu bị mặc định hóa; simulator và các helper tài chính chưa dùng đủ baseline. Widget đã đọc saved dossier nhưng chưa nhận được thông báo refresh đúng cách.

26/26 test hiện tại pass không chứng minh các lifecycle này đúng. Người dùng cần một bản sửa bảo vệ dữ liệu đang tồn tại, hoàn thiện tính nhất quán tài chính và được kiểm chứng qua public repository operations lẫn Chrome extension thật.

## Solution

App nhận diện và tính lại derived results cũ bằng bộ quy tắc hiện hành, giữ nguyên các đầu vào người dùng có thể khôi phục. Mọi mutation, kể cả initialization và migration phát sinh từ thao tác đọc, đều đi qua writer duy nhất. Backup được kiểm tra toàn bộ trước một lần commit collection và categories.

Baseline có hợp đồng rõ ràng về giá trị thiếu, zero, giá trị ước tính, fee representation và shipping evidence. Một bộ đầu vào tài chính chuẩn hóa phục vụ assessment, simulator, contribution, scenarios, target sourcing cost và working capital. Simulator khởi đầu đúng baseline, giữ các chi phí không có control và chỉ lưu khi người vận hành chủ động yêu cầu.

Widget cùng các view đọc canonical saved dossier và cập nhật sau storage commit qua cơ chế hoạt động thực tế trong content-script context. Giữ những sửa chữa đã đúng của vòng đầu và hoàn thiện 9 findings theo acceptance matrix dưới đây.

## User Stories

1. As an operator, I want saved schema v2 dossiers reassessed under the current rules, so that upgrading the extension removes stale readiness decisions.
2. As an operator, I want imported cached assessments ignored as current truth, so that an old backup cannot declare an incomplete product ready.
3. As an operator, I want recoverable inputs preserved during reassessment, so that correcting derived results does not erase my research.
4. As an operator, I want unverifiable historical rank and cost assumptions identified honestly, so that migration does not invent evidence.
5. As an operator, I want loading an old dossier and editing it at the same time to preserve the edit, so that background migration cannot undo a successful save.
6. As an operator, I want all initialization and migration writes governed by the same authority, so that opening multiple views does not create competing writers.
7. As an operator, I want each mutation to use the latest committed dossier, so that queued operations cannot write an obsolete snapshot.
8. As an operator, I want mixed collections upgraded correctly, so that a schema v2 record at the start does not hide older or stale records later in the collection.
9. As an operator, I want restore to validate products, categories and metadata before writing, so that a malformed category cannot leave a partial restore.
10. As an operator, I want a failed restore to preserve the complete previous state, so that an error message means my data was not changed.
11. As an operator, I want repeat restores and restores over existing records to preserve the documented restore contract, so that backed-up user fields can be recovered reliably.
12. As an operator, I want known actual costs separated from missing inputs and estimates, so that a calculated margin cannot silently rely on invented assumptions.
13. As an operator, I want readiness to require a supported shipping basis tied to the cost used, so that selecting QUOTED alone cannot complete fulfillment.
14. As an operator, I want reviewed weight-based shipping to retain its measured inputs and source, so that a default parcel cannot masquerade as inspected evidence.
15. As an operator, I want an incomplete cost model to stay pending, so that an unconfirmed default does not qualify a product for a sales trial.
16. As an operator, I want explicit zero fees and shipping retained through save, migration and restore, so that valid zero assumptions are not replaced by defaults.
17. As an operator, I want an agent percentage applied when I select that fee basis, so that an injected flat fee of zero does not cancel my real cost.
18. As an operator, I want invalid quote amounts, quantities and dates rejected before saving, so that malformed inputs cannot corrupt my dossier.
19. As an operator, I want valid partial quotes saved without claiming verification, so that I can continue research without fabricating missing fields.
20. As an operator, I want the same validation used for edits and imports, so that importing data cannot bypass the application rules.
21. As an operator, I want the simulator to load every saved financial assumption, so that opening a product reproduces its baseline result.
22. As an operator, I want costs without editable controls retained in the simulator, so that the UI does not silently drop platform, agent or other costs.
23. As an operator, I want dimensions and platform commission accepted by the baseline-save contract, so that valid submitted fields are not discarded.
24. As an operator, I want fixed return allowance and return-rate mode handled consistently, so that the preview and saved result use the same reserve.
25. As an operator, I want switching products to reset all scenario inputs, so that assumptions from one product do not leak into another.
26. As an operator, I want temporary scenario edits isolated until an explicit save, so that exploring an idea leaves the baseline intact.
27. As an operator, I want simulator save to preserve the result I previewed after reload, so that saving cannot reveal hidden differences in costs.
28. As an operator, I want contribution and ROAS outputs derived from the same cost lines as profit, so that the financial panels agree.
29. As an operator, I want target sourcing cost to account for all applicable operating costs, so that its promised margin is achievable under the stated assumptions.
30. As an operator, I want alternative risk scenarios to state which assumptions differ, so that a scenario does not accidentally omit unchanged fees.
31. As an operator, I want working-capital estimates to retain my order and settlement assumptions, so that they remain consistent with the selected scenario.
32. As an operator, I want the open Coupang widget to refresh after a dashboard edit commits, so that its decision agrees with the other views without reloading the page.
33. As an operator, I want a failed save to leave the displayed committed assessment unchanged, so that the widget does not show an update that never persisted.
34. As a maintainer, I want regressions to start from representative old saved dossiers and real command sequences, so that new-fixture tests do not overlook upgrade failures.
35. As a maintainer, I want every finding linked to a current acceptance result, so that a passing test count cannot substitute for feature completion.

## Implementation Decisions

### Shared contracts and scope

- Follow the existing glossary, accepted provenance/eligibility ADR and the original and first corrective specs. Keep research thresholds, WPI weights, eligibility states and operator-versus-observation ownership unchanged.
- Complete the existing repository, authoritative writer, migration, restore, financial calculator, assessment and view controllers. This is a correction of the agreed behavior, not a redesign of the product or a framework migration.
- Use F01–F09 as review identifiers for this second round; they do not denote product schema versions. The previous R01–R11 acceptance contracts continue to apply.
- Preserve useful first-round changes. Add regressions for the remaining failures, then verify that correcting them does not break the working quote invalidation, target-price preservation, KC review, unknown BSR and unrounded threshold behaviors.

### F01: Current assessment for existing and imported dossiers

- Introduce explicit derived-result revision tracking separate from, or coordinated with, the product data schema. An old schema v2 record must not bypass reassessment solely because its dossier objects exist.
- Before exposing current readiness or summary counts, detect missing/stale assessment revision and compute canonical financial, WPI and eligibility outputs using current rules. Until that completes, the record cannot be presented as currently ready_for_trial.
- Stored/imported assessment, complete flags, WPI totals and cached financial output are derived data, not trusted inputs. Recompute them for both existing products and new products restored from backup; the empty-collection branch must have the same rule as the matching-product branch.
- Preserve user inputs, identity, watchlist, grouping, evidence and recoverable observations. Legacy aliases are not sufficient proof of verified BSR. An old rank promoted from listing position stays unverified unless supporting rank observation is recoverable.
- Defaults previously written without operator confirmation remain distinguishable as unconfirmed assumptions. Do not claim that historical zero/default values were explicitly supplied if that provenance is unavailable. Do not guess a lost target price or invent quote/source dates.
- Reassessment/migration is idempotent, covers every relevant record in a mixed collection and leaves the collection usable after reload. Do not base the need for migration only on the first product.

### F02: Mutation authority includes reads that trigger writes

- The existing service-worker writer governs initialization, seed loading, schema migration, reassessment, restores and ordinary edits. UI and content-script reads may request those operations but must not privately commit a migrated collection.
- Read the latest committed snapshot inside each serialized operation. Never capture a collection before entering the queue and later use it as the replacement state.
- Migration reads and edits can interleave safely: a COGS edit acknowledged as successful survives subsequent migration/reassessment. Preserve the same guarantee for edits to baseline, evidence, watchlist and grouping.
- Initialization is based on the latest storage state and must not replace a collection created by another acknowledged operation. Errors are propagated; a failed initialization/migration does not silently fall back to a destructive empty collection.
- A returned successful mutation includes its matching assessment and is acknowledged after commit. Startup/reconnection and multiple clients share that contract.

### F03: Validate and commit the complete restore

- Validate the supported backup envelope, version, products, categories, identities and all provided field types, numeric values, dates and metadata before mutation. Reject malformed categories, conflicting/duplicate identities and unsupported formats clearly.
- An incomplete but structurally valid dossier can be restored and remains pending. Invalid evidence or metadata cannot be silently skipped or converted into an apparently valid default.
- Construct the entire restored state and current assessments before persistence. Commit the related products, categories and required version metadata in one storage operation through the authoritative writer. No sequential product-then-category writes with separate partial outcomes.
- Validation failure and storage failure leave the prior complete state unchanged. The public API rejects and the UI shows an error without announcing success or installing a false local state.
- Retain the previous restore contract: recover backed-up user fields for matching products, keep their established internal identity, retain unrelated products, and restore category information needed for the backed-up grouping. Repeated restore is idempotent.

### F04: Cost completeness and fulfillment evidence

- Financial normalization preserves missing, explicit zero and estimated values before applying simulation defaults. Required baseline inputs are supplier cost, exchange rate, platform commission, selected agent fee basis, shipping, advertising, return allowance and other per-order costs.
- The complete flag describes known, explicitly established applicable baseline inputs. Entered zero can satisfy an applicable zero cost; an absent fee replaced by zero or an absent exchange rate replaced by 190 cannot silently satisfy completeness. Simulation may use labeled assumptions without establishing readiness.
- A QUOTED shipping basis requires an actual saved amount and supporting source/reference for that quote. Bind the evidence to the shipping cost used by the financial calculation. Choosing a basis string alone is insufficient.
- A reviewed weight-based basis retains measured weight and relevant dimensions, the reviewed tariff/source and the assumptions necessary for its computation. Missing measurements cannot become a reviewed default 300g parcel.
- Delivery estimate and reviewed return arrangement remain required. A fulfilled evidence section and financial shipping completeness must agree; neither can mask a missing basis in the other.
- Invalid or incomplete financial results cannot establish a confirmed business failure from placeholder zero profit. Complete, valid failure data yields not_eligible; otherwise missing costs keep needs_verification unless another valid requirement is already confirmed failed.
- Provide a usable UI path to establish each required cost and shipping assumption without fabricating values. Preserve provenance when migrating existing dossiers.

### F05: Simulator and baseline use all applicable inputs

- Build simulator inputs from the full selected baseline. Editable controls change selected fields on that input, retaining platform commission, flat/percentage agent fee, other costs, fixed/rate return reserve, dimensions, fulfillment and all noneditable cost fields.
- Switching products fully resets the scenario from the new baseline. Zero remains zero. An empty control remains missing rather than becoming an undisclosed free cost.
- For an untouched valid baseline, simulator price, cost lines, contribution and margin must equal its canonical saved financial result. Cash-flow assumptions also load from the product.
- Extend the baseline-save contract to accept and persist every supported submitted financial field, including platform commission and dimensions. No validated parameter is silently dropped. Partial baseline updates validate the effective merged result as well as submitted values.
- Scenario changes do not write until explicit save. Saving the preview is one logical commit of the same normalized effective inputs used to preview it. After save/read/reload, the financial result matches that preview.
- Preserve documented fee and return modes. A fixed return amount must not be invisibly replaced by a rate, or ignored while a rate control appears to change the calculation. Show the active basis or expose an explicit mode change.
- Keep operator fulfillment independent from competitor Rocket observations. Retain the already corrected CGF selection behavior.

### F06: Validate quotes and imports at public boundaries

- Reuse a shared quote/evidence validation contract in public quote saves and backup validation, before commit. If an optional field is present, it must have a valid type and value; absence can describe valid unfinished research.
- Currency amounts must be finite and nonnegative for simulation/manual cost storage. A verified supplier quote has the stricter positive price and applicable terms from the previous spec. Provided quantities/MOQ must be positive integers; a provided date must parse to the documented valid date representation.
- Reject negative/nonfinite prices, impossible quantities, invalid dates and malformed metadata with field-specific errors. Do not silently retain the previous price or clear verification and then commit invalid new terms as if validation succeeded.
- Preserve legitimate partial quotes and conservative LEGACY provenance. Missing dates/sources remain missing; do not fill them with the current time simply to satisfy verification.
- Keep verification bound to applicable quote terms. Ordinary term changes invalidate the active confirmation; an explicit new verification requires a complete valid quote and is committed with its terms.

### F07: Zero and fee representation survive the whole lifecycle

- Replace truthiness-based fallbacks in migration, save, restore and simulator loading with presence-aware semantics. An explicit commission zero remains zero; explicit shipping zero remains zero and uses its recorded basis.
- Do not manufacture a flat agent fee of zero when the supplied fee basis is percentage. Preserve which representation the operator selected. A percentage fee applies to its documented base and appears in the cost breakdown.
- Normalize ambiguous flat/rate inputs with an explicit selected basis or a documented compatibility rule; conflicting provided terms cannot silently change the payable fee between callers. Old injected defaults do not count as operator choices.
- Missing/default assumptions stay distinct from known zeros, even when their current numerical effect is identical. Lifecycle tests cover creation, migration, read, scenario load/save and export/restore.

### F08: All financial helpers share the same cost result

- Use the normalized cost model and effective cost lines for profit, unit economics, contribution, ROAS/CPA, scenarios, target sourcing cost and working capital. Do not reconstruct a different return reserve or omit a CGF/agent/platform/other cost in a helper.
- Pre-ad contribution subtracts all applicable non-ad per-order costs exactly once. Unit economics reuses the chosen fixed/rate return reserve from the canonical financial result. Its breakdown, reserve and total agree.
- Favorable/base/adverse scenarios explicitly identify their changed assumptions and retain every unchanged applicable cost, including the operator's fulfillment cost. They remain labeled assumptions.
- The target maximum sourcing-cost recommendation receives the effective baseline and stated target margin. Include commission, agent flat/rate fees, shipping/weight/dimensions, ads, returns, fulfillment and other applicable costs. Validate it by substituting the recommendation back into the same calculator; the promised margin must be attainable at the supported quote precision.
- If costs are incomplete, present the recommendation as conditional on named assumptions or unavailable. If no nonnegative cost can reach the target, report that outcome clearly; do not advertise an achievable target from omitted costs.
- Working capital retains order-volume/settlement inputs and states which costs require advance funding. Keep rounding at display boundaries and preserve already corrected margin/Rocket threshold comparisons.

### F09: Refresh content scripts through a supported path

- Keep the widget's saved-dossier lookup. Subscribe to committed product storage changes through a notification path available to content scripts, such as storage change events, or explicitly relay messages to matching tabs. Runtime broadcast alone is insufficient.
- Refresh the matching widget from canonical committed data after a relevant edit, restore or reassessment. Dashboard/side panel summaries use the same results. Coalesce duplicate updates so refresh does not create additional writes or loops.
- Failed writes do not trigger a committed-success refresh. The widget remains on the previous committed assessment; unsaved products remain provisional.
- Verify the chosen notification path in the installed extension; a mocked runtime listener receiving a manually injected message does not establish actual Chrome delivery.

## Testing Decisions

### Seams and prior art

- Reuse the two user-confirmed seams: public product lifecycle operations through the storage repository, and user actions in an installed Chrome Manifest V3 extension with real default CSP and storage. Upgrade/race/restore scenarios extend these same interfaces.
- Assert observable returned/saved dossiers, current decisions, financial lines, visible UI and durable values after reload. Avoid queue internals, private helper calls or assertions tied to a particular migration implementation.
- Extend the existing Node suites for migration, preservation, backup, economics, eligibility and extraction. Keep source-level CSP checks as supplementary checks. Use the existing 26 tests as regression coverage, correcting incomplete positive fixtures where needed to meet the original contracts.
- Add representative persisted schema v2 fixtures from the previous implementation, including cached ready_for_trial with missing evidence, old rank aliases, default-filled costs and mixed collections. Tests built exclusively from newly created dossiers are insufficient.
- Use isolated storage snapshots and at least two independent clients for migration/edit races. Verify public outcomes regardless of whether reads or edits begin first. Fault injection exercises an entire restore commit, not only an isolated setter.
- DOM/controller simulation is useful for financial reproduction but is not the installed-extension gate. Current historical browser audit reports do not replace a new run of relevant interactions.

### Acceptance matrix

| ID | Observable case | Required result |
| --- | --- | --- |
| F01 | Read old schema v2 dossier with cached ready_for_trial but missing evidence | Current needs_verification; no stale-ready summary/filter/widget |
| F01 | Restore that dossier into empty and nonempty collections | Same freshly computed decision; imported cached outputs ignored |
| F01 | Mixed old/new records and repeated read/reload | Every stale record handled, no lost user fields, idempotent current results |
| F01 | Old rank alias without verified BSR source; old automatically default-filled costs | No fabricated BSR/evidence; uncertainty remains visible |
| F02 | Legacy cost 100; edit to 222 concurrently with getAllProducts/migration | Acknowledged edit survives; final cost 222 after reload |
| F02 | Two independent views initialize/read/migrate while writer edits evidence/baseline | No lost updates or overwritten collection; one effective writer |
| F02 | Initialization or migration persistence fails | Visible/API error; prior collection intact, no destructive empty fallback |
| F03 | Restore cost 999 with malformed categories, invalid date/numeric metadata or conflicting identities | Reject before writing; products, categories and grouping unchanged |
| F03 | Valid restore, then storage failure at the commit | Complete prior state preserved; no success or partial local state |
| F03 | Restore over edited records, empty restore and repeat restore | Full saved user fields/grouping recover; unrelated products retained; no duplicates |
| F04 | Otherwise valid dossier with absent exchange, commission, agent/other cost or advertising/returns | Missing inputs visible; no complete financial claim or ready_for_trial |
| F04 | Fulfillment marked QUOTED without saved quote amount/source; reviewed weight without measurements | Fulfillment pending; estimated/default shipping cannot clear readiness |
| F04 | Complete costs plus supported quote/measurement basis and required evidence | Consistent calculation and ready_for_trial when all profile requirements pass |
| F05 | Product with target 110,000, COGS 150 CNY at 190, commission 20%, agent 5,000, other 2,000, ship 3,000, ads 10,000, fixed returns 10,000, BUYING_PER_ORDER | Baseline and untouched simulator both profit 29,500; simulator must not show 53,100 |
| F05 | Submit changed platform commission and dimensions via baseline save | Both persist and affect the effective calculation after read/reload |
| F05 | Switch A/B with different fee/return modes; edit without saving; explicitly save | No leaked controls/costs; temporary edit isolated; saved result equals preview |
| F06 | Quote save/import with cost -5, quantity -1 or date not-a-date | Field-specific rejection and no committed mutation |
| F06 | Missing optional quote fields versus valid explicit zero/manual cost | Valid unfinished research retained unverified; missing is not fabricated |
| F06 | Edit verified quote terms; explicitly re-verify a valid replacement | Previous confirmation invalidated; new confirmation applies to current terms |
| F07 | Save/migrate/restore commission 0 and shipping 0 | Effective commission and shipping remain zero, not 11% and 3,000 |
| F07 | Percentage agent fee 10% with no selected flat fee, COGS 100 CNY at 190 | Agent cost 1,900; no invented zero-flat override |
| F07 | Blank/null fields, explicit zeros and conflicting flat/rate inputs | Missing/zero/basis distinctions remain consistent across callers/views |
| F08 | Revenue 110,000, COGS 150 CNY at 190, commission 20%, agent 5,000, other 2,000, ship 3,000, fixed returns 10,000, rate also recorded 3%, ads 10,000, ROCKET_GROWTH fee 400 | Profit and unit economics pre-ad contribution both 39,100; no alternate 46,200 result |
| F08 | Same complete baseline, requested target margin 30%; substitute recommended CNY cost into calculator | Margin reaches stated target at supported precision; old recommendation 273 CNY with 5.2% margin is rejected as an adequate recommendation |
| F08 | Risk scenarios and working capital under custom fee/fulfillment/cash-flow inputs | Retain unchanged costs; disclose changed assumptions; arithmetic and labels agree |
| F09 | Open widget for saved dossier; commit cost/evidence edit from dashboard | Widget, dashboard and side panel update to the same committed result without page reload |
| F09 | Failed edit; unrelated product change; restore/reassessment | No false committed state; only relevant refresh; no update loop |

### Completion gates

- Run original high-KC/high-WPI, negative-margin, BSR-unknown, quote verification, target-preservation and exact margin/Rocket boundary regressions alongside F01–F09 checks.
- Installed Chrome checks use a temporary test profile and deterministic Coupang-like fixtures. Exercise upgrade/reload, dossier save, simulator load/save, restore, two-view edits and live widget refresh. Do not overwrite real user dossiers for test setup.
- Require both API/data assertions and visible user outcomes. A successful mutation response, a modal opening, or an installed extension starting is not proof that the entire lifecycle passed.
- Produce a finding-to-check report with expected/actual results, setup, command/scenario, revision or snapshot identification, and pass/fail/blocked/not-run. Distinguish current installed-extension evidence from Node/DOM simulation and historical artifacts.
- All mandatory relevant acceptance gates must be confirmed before marking complete. If Chrome validation cannot run, report the remaining gate accurately rather than claiming full completion from the Node suite.

## Out of Scope

- Changing research thresholds/WPI weights, new product design or rebuilding the extension architecture in a different framework.
- Live supplier/market integrations, automated KC legal certification, marketplace publishing or order execution.
- Reconstructing lost historical target prices, verification or observations by guessing.
- A general-purpose distributed database or multi-user/cloud synchronization.
- Unrelated cleanup and extra test breadth without an identified remaining risk.
- Implementing fixes or modifying prior specs/issue statuses during this spec-writing task. This step publishes new handoff documents only.

## Further Notes

- The companion implementation feedback contains the nine review cases, snapshot code locations and the concrete implementation lessons for Antigravity. Read it before planning the implementation.
- F01–F09 narrow the remaining work in the first corrective spec. They do not waive its broader evidence, ownership and installed-extension requirements.
- Suggested order: add lifecycle regressions; fix derived-result revision/migration authority; complete restore validation/commit; unify financial inputs and quote validation; integrate simulator and notifications; run real Chrome acceptance checks.
- The review ran 26 tests successfully and separately reproduced failures in memory/DOM simulation. It did not rerun the installed-Chrome gate. Git exposed only an empty initial commit, so the review compared the working snapshot to the specs rather than a complete commit diff.
- The user previously confirmed the public storage lifecycle and installed-extension testing seams. This second-round spec uses those same seams; it is published ready-for-agent without another interview.
