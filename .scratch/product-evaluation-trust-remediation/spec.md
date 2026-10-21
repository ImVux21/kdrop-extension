# K-Drop Studio: Sửa các sai lệch sau triển khai Product Evaluation Trust

Status: ready-for-agent
Labels: ready-for-agent
Date: 2026-10-12
Testing seams: kế thừa hai điểm kiểm thử đã được người dùng xác nhận
Related spec: ../product-evaluation-trust/spec.md
Implementation feedback: ./implementation-feedback.md

## Problem Statement

Sau triển khai Product Evaluation Trust, người vận hành vẫn có thể nhận kết luận “Đủ điều kiện thử bán” từ hồ sơ chưa đủ chứng cứ. Dữ liệu quan sát và giả định kinh tế bị trộn lẫn; quét lại, khôi phục backup và ghi từ nhiều màn hình có thể làm thay đổi hoặc mất dữ liệu đã nhập. Simulator và widget chưa phản ánh cùng baseline với dashboard.

Review đã chỉ ra 11 lỗi R01–R11, được mô tả và gắn vị trí mã trong tài liệu implementation feedback. Trong lần review, 19 test hiện tại đều pass nhưng các ca tái hiện qua API công khai và nhiều context vẫn cho kết quả sai. Do đó, việc có các module mới, schema mới và test xanh chưa chứng minh các tiêu chí của spec gốc đã hoàn tất.

Mục tiêu của đợt sửa này là hoàn thành các hợp đồng hành vi đã thống nhất, bảo toàn hồ sơ người vận hành và tạo bộ kiểm chứng có thể lặp lại để Antigravity bàn giao một kết quả đáng tin cậy.

## Solution

Mỗi sản phẩm có dữ liệu Coupang quan sát riêng, baseline người dùng riêng và chứng cứ có nguồn riêng. App chỉ kết luận ready_for_trial khi mọi yêu cầu có đủ bằng chứng hợp lệ và đều đạt. Thiếu dữ liệu luôn tạo việc cần xác minh; WPI và từ khóa KC không được thay thế chứng cứ.

Các thao tác lưu, quét lại và khôi phục có hợp đồng khác nhau nhưng cùng đi qua một nơi điều phối ghi cho toàn extension. Dashboard, side panel, simulator và widget đọc cùng hồ sơ đã lưu. Người vận hành thử giả định trong simulator rồi chủ động lưu cả kịch bản; lỗi ghi không tạo trạng thái thành công giả.

Giữ giao diện và kiến trúc Chrome Manifest V3 hiện tại. Hoàn thiện module hiện có, bổ sung trường chứng cứ và sửa test để kiểm tra hành vi thực tế. Không cần thay framework hoặc kết nối dịch vụ thị trường mới.

## User Stories

1. As an operator, I want every required evidence section checked before readiness is granted, so that an incomplete dossier cannot look ready for a sales trial.
2. As an operator, I want missing evidence listed with specific next actions, so that I know what research remains.
3. As an operator, I want demand evidence tied to a product keyword, geography, period, source and absolute-search unit, so that unrelated or normalized metrics cannot satisfy the demand threshold.
4. As an operator, I want product-specific seasonality findings recorded, so that checking a box alone does not complete demand verification.
5. As an operator, I want Rocket competition evaluated from a documented relevant sample, so that a single badge does not stand for market competition.
6. As an operator, I want impossible Rocket counts rejected, so that negative counts or counts above the sample size cannot produce a passing assessment.
7. As an operator, I want seller evidence to identify a comparable international-delivery offer and its seller, so that domestic-seller reviews cannot satisfy my operating profile.
8. As an operator, I want seller-specific reviews kept separate from product reviews, so that the two measures are not substituted.
9. As an operator, I want quote verification attached to supplier, variant, date, quantity, MOQ and unit price, so that the confirmation applies to the purchase I intend to make.
10. As an operator, I want changing verified quote terms to require a new confirmation, so that a manual replacement price cannot inherit old verification.
11. As an operator, I want shipping evidence, delivery expectations and return arrangements recorded, so that fulfillment readiness is assessed alongside sourcing.
12. As an operator, I want keyword KC output displayed as a risk signal, so that absence of a sensitive keyword does not claim a reviewed exemption.
13. As an operator, I want readiness to require a supporting KC review even for LOW risk, so that unreviewed products remain pending.
14. As an operator, I want observed Coupang price separated from my target selling price, so that competitor observations do not silently change my economics.
15. As an operator, I want saving a target price to leave the observed price intact, so that market history remains meaningful.
16. As an operator, I want single and batch rescans to preserve my entire baseline, evidence, grouping and watchlist, so that a market refresh does not undo my work.
17. As an operator, I want closely spaced edits from different extension views to both persist, so that opening multiple tabs does not cause lost updates.
18. As an operator, I want a completed save to contain its updated assessment, so that the displayed decision matches the committed inputs.
19. As an operator, I want failed writes reported without a success notification or false local commit, so that I can safely retry.
20. As an operator, I want restore to recover backed-up user fields for an existing product, so that a backup can undo incorrect edits.
21. As an operator, I want malformed backups rejected before any data changes, so that a bad record does not cause a partial restore.
22. As an operator, I want legacy backups retained with conservative provenance, so that historical estimates do not become verified quotes.
23. As an operator, I want search-list position kept separate from verified BSR, so that search placement does not earn demand points.
24. As an operator, I want an incomplete WPI to show missing components, so that a partial score cannot appear as a complete rating.
25. As an operator, I want the simulator to load all saved assumptions, including valid zeros, so that its starting result matches the baseline.
26. As an operator, I want switching simulator products to reset every product-dependent control, so that the previous product's assumptions do not leak into the next one.
27. As an operator, I want competitor Rocket status kept separate from my fulfillment model, so that I am not assigned warehousing fees I did not select.
28. As an operator, I want temporary scenario edits to leave storage untouched until I save, so that experiments do not change my research baseline.
29. As an operator, I want saving a scenario to commit all supported assumptions together, so that the saved result matches the simulation.
30. As an operator, I want order volume and settlement assumptions to load and save with the scenario, so that working-capital estimates reflect my plan.
31. As an operator, I want the widget to use and refresh my saved dossier, so that it agrees with the dashboard and side panel.
32. As an operator, I want unsaved products to be identified as provisional, so that fresh DOM data is not mistaken for a verified saved dossier.
33. As an operator, I want invalid financial values rejected wherever they enter the app, so that imports and public storage operations cannot bypass form validation.
34. As an operator, I want missing costs distinguished from explicit zero and estimates, so that an incomplete cost model cannot look complete.
35. As an operator, I want eligibility evaluated before display rounding, so that a margin below 25% cannot pass after rounding.
36. As an operator, I want contribution, target sourcing cost and working-capital calculations to use the same saved assumptions, so that the financial outputs do not contradict each other.
37. As a maintainer, I want regression tests based on observable product lifecycles, so that a rewrite can preserve the same behavior without matching private implementation details.
38. As a maintainer, I want each review finding linked to a reproducible acceptance check, so that completion is supported by evidence.

## Implementation Decisions

### Existing contracts and scope

- Follow the domain glossary and accepted Product Data Provenance and Trial Selling Eligibility ADR. Keep the current WPI weights and research-profile thresholds. This remediation completes those contracts; it does not recalibrate the research model.
- Modify the existing storage repository, financial calculator, eligibility evaluator, KC risk module, extraction adapter and view controllers. Keep public product lifecycle operations as the main interface. Do not introduce view-specific eligibility evaluators.
- Preserve partial dossiers: operators can save valid but incomplete research. An incomplete dossier remains needs_verification unless a valid, confirmed requirement has failed. Structurally invalid values are rejected; they are not evidence of a confirmed business failure.
- A confirmed failure yields not_eligible; otherwise a required unknown or unresolved review yields needs_verification; only all required passes yield ready_for_trial. WPI cannot override the result.

### R01–R02: Evidence and readiness

- KC keyword matching supplies a risk signal only. LOW, empty title, or no keyword match cannot supply evidence of exemption. Every candidate needs a recorded operator review with supporting source/reference, review date and rationale. A status dropdown or bare Boolean does not satisfy this requirement. A confirmed ineligible review blocks readiness.
- Demand evidence requires the relevant product keyword, geography, previous-year period, source, absolute monthly-search units, peak count and documented seasonality finding. A normalized trend index cannot pass the absolute-search criterion. No source/period is fabricated for an older record.
- Rocket evidence requires a relevant keyword/category, inspection date, positive integer sample size and integer count between zero and sample size. Compute the share from counts; do not trust an imported percentage or round it before comparison.
- Seller evidence requires a comparable offer URL, seller identity, inspection date, a positive international-delivery observation and seller-specific review count. A false or unknown international-delivery flag cannot pass this criterion. Product reviews remain separate.
- A verified sourcing quote requires a supplier URL, quote date, variant/specification, finite positive unit price, positive integer intended quantity, positive integer MOQ and applicability to that quantity. If MOQ exceeds the intended quantity, the quote does not verify that order until the operator records terms that make it applicable.
- Fulfillment is an explicit required criterion: a supported shipping cost basis, delivery estimate and reviewed return arrangement must be saved. A default 300g parcel or an undocumented estimator cannot complete fulfillment evidence. A weight-based simulation stays visibly estimated; a reviewed weight/dimension basis can be recorded with its assumptions and source.
- Financial completeness covers the baseline cost inputs from the original spec: supplier, exchange rate, platform commission, buying agent, shipping, advertising, returns and other per-order costs. A known explicit zero is valid where applicable. Missing inputs and default estimates stay distinguishable from known actual costs.
- Evidence-entry UI must expose the fields that these checks require. Show section-level reasons and the actions that remain; do not add a generic readiness override.

### R03: Observations and baseline ownership

- Market observations and user economic inputs have separate owners. Saving a target selling price changes economics only. Single-product and batch rescans update observations only and preserve the entire saved baseline, sourcing, evidence, identity, grouping and watchlist.
- Baseline calculations and the price eligibility criterion use the target selling price. Observed price is displayed independently. If a target is initially suggested from the observed price, keep it identifiable as a suggestion until explicitly saved; absent values do not silently become verified inputs.
- Compatibility aliases have one documented meaning and must not route an observed value back into user-owned economics. Avoid truthiness-based fallbacks that erase explicit zero.
- Do not invent previously overwritten target prices during migration. Preserve recoverable user fields, identify unresolved legacy values and ask the operator to re-establish missing information through the normal UI.

### R04: One writer across extension contexts

- All mutations from dashboard, side panel, content scripts and background tasks are dispatched to one authoritative writer in the extension service worker. The storage repository remains the public facade; view contexts do not independently perform whole-collection read–modify–write operations.
- The writer serializes product edits, baseline saves, scans, imports and migration. Each operation reads the latest committed data inside the serialized operation, validates it, computes derived results, and commits before acknowledging success.
- A queue local to each browser context is insufficient. Keep the test adapter capable of exercising independent clients against the same storage authority.
- Saving a complete scenario, or a dossier with its verification, is one logical commit. Related product/category changes in a restore are committed together. Failed writes leave the previous state intact and produce a visible error.
- Publish changes only after successful commit. Ensure open extension pages and matching content-script widgets receive committed updates. Reconnection or service-worker startup must preserve the same public operation semantics.

### R05: Restore has a distinct contract

- Keep market-rescan merge and backup restore separate. Restore replaces backed-up fields of matching products, including baseline, sourcing, evidence, watchlist and research grouping. Unrelated products remain in the collection. Preserve the existing internal identity when matching the same product, without losing backed-up user fields.
- Validate the entire backup before writing: supported version, collection shapes, product identities, numeric values, field types, dates and source metadata. Invalid records are not silently skipped. Duplicate/conflicting product identities are rejected clearly.
- Incomplete but structurally valid dossiers may be restored and remain pending. Malformed metadata is an error. Reject unsupported future versions instead of guessing their meaning.
- Restore original inputs/provenance and recompute current derived assessment; never trust imported cached ready_for_trial or WPI as current truth. Legacy arrays cannot establish verification from an unsupported flag.
- Export contains the full recoverable dossier. Restoring into an empty collection and restoring over an edited existing product are both supported behaviors. Repeating restore is idempotent.

### R06: Verification applies to particular quote terms

- Verification belongs to the quote's applicable supplier, variant, date, unit price, quantity and MOQ. Changing any of those terms invalidates the old confirmation unless the operator explicitly re-verifies the complete new quote in the same validated operation.
- An ordinary manual COGS edit remains MANUAL, clears active verification, and makes sourcing readiness require review. Retain historical information honestly if useful, but do not apply an old confirmation to new values.
- Rescanning observations does not change or upgrade a still-applicable quote's verification. Import/restore validates verification metadata and recomputes the resulting assessment.

### R07: Verified BSR and WPI

- Retain listing position with its page context separately from verified BSR and its observation source/date. Legacy or ordinary-search positions cannot satisfy a BSR component. Missing fields stay unknown through extraction, migration, enrichment and display.
- Show a complete numeric WPI only when every required component is known. Otherwise display the available breakdown and missing components; do not present their sum as a complete score or normalize it to 100. Estimated inputs make the screening result provisional.

### R08–R09: Shared view behavior

- Opening the simulator fully initializes every supported control from the selected product: target price, supplier cost, exchange rate, shipping basis, weight/dimensions, platform and agent costs, ads, return allowance, other costs, fulfillment, target contribution, order volume and settlement assumptions. A control must not retain a previous product's value. Valid zero values remain zero.
- Use the saved operator fulfillment model. A competitor Rocket Delivery/Growth badge never selects the operator's fulfillment model.
- Initial simulator financial outputs must equal the saved baseline for equivalent inputs. Scenario editing is temporary. Explicit save commits all supported scenario inputs together and recalculates the dossier. If a supported baseline cost has no editable control, retain and use it rather than replacing it with a hidden default.
- The product widget resolves the product identity to the saved dossier and uses its canonical financial/WPI/eligibility results. Fresh DOM observations must not discard saved economics or evidence. An unsaved product is visibly provisional.
- Refresh dashboard, side panel, relevant widget and summary counts from committed changes. Do not show success or optimistically replace a committed assessment on failed saves.

### R10–R11: Financial input and precision

- Normalize accepted financial inputs into one contract before validation and calculation, including existing parameter/config aliases. Validation applies to the effective exchange rate, platform commission, buying-agent fee/rate, shipping, ads, return amount/rate, dimensions, weight and other costs.
- Exchange rate is finite and strictly positive. Fractional commission/agent rates are finite within their documented range; percentage return allowance is within 0–100. Monetary costs are finite and nonnegative. Quantities and timing inputs use their documented positive ranges. Conflicting aliases do not silently change precedence between callers.
- Reject invalid inputs at public save/import boundaries as well as calculation entry points. Empty fields remain missing; they do not become valid zeros through coercion. A failed validation does not commit an invalid baseline or return an apparently complete financial result.
- Evaluate thresholds from unrounded ratios/calculation values. Round for presentation only. Margin 24.96% fails the 25% requirement; exactly 25% passes. Rocket share 69.96% passes the below-70% requirement; exactly 70% fails.
- All financial outputs use the same normalized baseline cost components. Pre-ad contribution, post-ad contribution, target maximum supplier cost, scenarios and working capital must carry the applicable exchange, fulfillment, agent, platform, shipping and return assumptions consistently. Recommendations state any deliberately different target assumptions.

## Testing Decisions

### Confirmed seams and existing prior art

- Retain the two testing seams already confirmed by the user: public product lifecycles through the storage repository, and user interactions in an installed Chrome Manifest V3 extension with its real CSP/storage. Multiple-context checks extend those same seams; they do not add a third product interface.
- Prefer tests that assert saved/returned dossiers, visible decisions, financial amounts and durable state after reload. Do not assert helper call counts, queue implementation, event order internals or private object layouts.
- Extend existing Node tests for eligibility, preservation, economics, migration, extraction and backup. Existing CSP source checks remain a supplement to installed-extension interaction checks.
- Replace the current incomplete “complete passing dossier” fixture with a genuinely complete dossier supported by the agreed profile. Derive expected decisions from the spec and glossary, not from current implementation output.
- Build every ready_for_trial positive test through valid public saves, then remove or invalidate one required section at a time. Include failed-write behavior and independent-client interleavings. Storage test reads return isolated snapshots, as real Chrome storage does.
- Existing exploratory audit scripts/reports can provide cases, but stored reports and old screenshots are not proof for the new implementation. Re-run applicable checks and document setup, current revision, command/scenario and observed result.

### Acceptance matrix

| ID | Observable scenario | Required result |
| --- | --- | --- |
| R01 | Otherwise complete dossier, LOW KC signal, no supporting review | needs_verification; KC review is pending, not PASS |
| R01 | Empty title or no keyword match; status dropdown without supporting evidence | No inferred exemption; unresolved review remains visible |
| R02 | Complete valid dossier with all actual costs and required evidence | ready_for_trial with no missing requirements |
| R02 | Remove keyword, geography, period, source, absolute units or seasonality finding individually | Demand remains pending; no readiness |
| R02 | Keep seller review count 50 but set international delivery false/unknown, or remove seller/offer identity | Seller criterion cannot PASS |
| R02 | Remove quote date, variant, quantity or MOQ; intended quantity below applicable MOQ | Quote remains unverified/pending |
| R02 | Remove shipping basis, delivery estimate or reviewed return arrangement individually | Fulfillment is pending; no readiness |
| R02 | Missing agent/other cost versus explicit zero; default shipping versus supported basis | Completeness and provenance differ; missing/default values do not silently complete readiness |
| R02 | Negative, fractional or oversized Rocket count; nonpositive/fractional sample | Reject invalid evidence without mutating the saved dossier |
| R03 | Observed price 110,000; save target 130,000; single rescan 90,000; reload | Observed becomes 90,000, target stays 130,000; financials use 130,000 |
| R03 | Repeat the same lifecycle through batch import | Same preservation, identity, evidence, grouping and watchlist |
| R04 | Two independent contexts change COGS to 222 and ads to 888 closely together | Both persist after reload; neither successful edit disappears |
| R04 | Failed scenario/dossier/restore write | Visible error, no success notification, no partial/false committed state |
| R05 | Backup cost 150 and full user fields; change existing cost to 999, watchlist/group/evidence; restore | All backed-up user fields recover; unrelated products remain |
| R05 | Empty restore; repeated restore; legacy array import | Full round-trip, no duplicates; legacy values remain conservative |
| R05 | Valid record followed by malformed record/metadata or unsupported backup version | Clear error; products and categories unchanged |
| R06 | Verify quote, then ordinary edit of price/variant/quantity/MOQ/supplier/date | Old verification no longer applies; sourcing requires review |
| R06 | Explicitly re-verify a valid new quote; rescan observations | New confirmation persists; rescan does not replace quote terms |
| R07 | Extract ordinary search position 1 with rank unknown, then save/read | Listing position stays 1; BSR unknown; no BSR demand points |
| R07 | Missing WPI component through saved lifecycle and all views | Missing component is visible; no complete numeric score |
| R08 | Product A: rate 210, returns 0, custom fees/orders/days; switch from product B into A | All controls and financial outputs equal A's saved assumptions |
| R08 | Operator BUYING_PER_ORDER; competitor ROCKET_GROWTH | CGF remains unselected; no operator CGF fee |
| R08 | Edit scenario without saving, then reload; explicitly save scenario including cash-flow inputs | First baseline unchanged; second persists all saved inputs and matching outputs |
| R09 | Existing complete dossier opened on a deterministic detail fixture, then edited from dashboard | Widget, dashboard and side panel agree after commit and reload |
| R10 | Invalid rates/costs supplied through params, config aliases, save and import | Reject finite-range violations consistently; collection unchanged on rejected mutations |
| R10 | Valid zeros for costs/returns/commission; blanks/nulls for missing costs | Zeros stay zero; missing stays missing |
| R11 | Sales 100,000, COGS 100 CNY at 190, platform 11%, shipping 3,000, ads 42,040, returns/agent/other explicit zero | Profit 24,960; true margin 24.96%; margin criterion FAIL |
| R11 | Margin exactly 25%; Rocket counts 6,996/10,000 and 70/100 | Margin passes; first Rocket sample passes, second fails |

### Completion evidence

- Keep the original high-KC/high-WPI and negative-margin regression cases. Add valid threshold cases for 10,000 searches, 30 seller reviews and target-price tiers; vary only the tested requirement on an otherwise complete dossier.
- Installed-extension checks cover real dashboard edits, dossier saves, simulator baseline load/save, restore, side panel/widget refresh, reload, single/batch scan and two-page editing. Inspect extension/page consoles for relevant CSP, messaging and storage errors.
- Map every R01–R11 and associated acceptance row to the current check that verifies it. Report pass, fail, blocked or not-run honestly. If the real Chrome gate cannot run, preserve that unresolved gate instead of marking the work complete.
- Use a temporary test profile and deterministic Coupang-like fixtures. Do not overwrite real user records to prove restore or concurrency.
- No requirement is closed merely because a function exists, an incomplete positive fixture passes, a modal opens, or a regex finds no inline handlers. Completion requires the relevant public lifecycle or installed-extension outcome.

## Out of Scope

- New marketplace, trend or supplier integrations; live 1688 price fetching; supplier contact or order execution.
- Automated legal certification or claims of guaranteed sales, Buy Box ownership, delivery or settlement timing.
- Changing WPI weights/research thresholds, training a predictive model, rebuilding the dashboard design or moving to a new framework.
- Cloud synchronization, multi-user storage and a general-purpose distributed transaction system.
- Reconstructing unknown historical values by guessing.
- Implementing application fixes in the spec-writing step or editing the original completed issue records. This deliverable publishes a corrective spec and implementation feedback; implementation is the next task for Antigravity.

## Further Notes

- Read the accompanying implementation feedback before changing code. It distinguishes directly reproduced review results from static-flow findings and gives starting locations, consequences and recommended improvements.
- The original spec remains the source of the broader feature contract. This corrective spec resolves the 11 review findings and explicitly covers adjacent acceptance cases needed to prove those corrections. It does not authorize unrelated scope expansion.
- Suggested implementation order: regressions/ownership contracts; centralized writer and restore; quote/evidence validity; shared finance and precision; simulator/widget integration; installed-extension validation. Preserve useful existing changes while completing each lifecycle.
- During the review, Git exposed only an empty initial commit. The findings therefore compare the current snapshot to the agreed spec, rather than attributing each line to a particular commit or author.
- Prior user confirmation of the storage lifecycle and installed-Chrome seams remains applicable. The new spec is published with ready-for-agent; no additional interview or renewed approval is needed for those same seams.
