# K-Drop Studio: Dữ liệu đáng tin cậy và đánh giá điều kiện thử bán

Status: completed
Labels: completed
Date: 2026-10-12
Testing seams: confirmed by user

## Problem Statement

Người vận hành muốn chọn sản phẩm cho mô hình mua hộ 1688 → Coupang theo đơn và xoay vòng vốn. Hiện app có thể hiển thị nhãn Diamond/Gold/Silver từ dữ liệu ước tính hoặc thiếu bằng chứng, khiến người dùng hiểu quá mức về khả năng bán và lãi thực tế.

Giá vốn 1688 của sản phẩm mới quét được suy từ giá bán Coupang. Dữ liệu có sẵn không thể hiện nguồn và thời điểm xác minh giá. Trang chi tiết tự gán hạng 1, rating 4,8 và 100 review. Một sản phẩm có rủi ro KC cao vẫn có thể đạt Diamond; sản phẩm đang lỗ vẫn có thể đạt Silver. Khi quét lại, giá nhập tay và watchlist có thể bị ghi đè. Các thao tác trong dashboard phụ thuộc vào sự kiện JavaScript inline, không phù hợp chính sách thực thi của Chrome extension.

Người dùng cần phân biệt điều app thực sự quan sát được, điều đang giả định và điều đã tự kiểm tra. Họ cũng cần biết lý do một ứng viên chưa đủ điều kiện thử bán, thay vì chỉ nhận tổng điểm cao.

## Solution

Hoàn thiện quy trình hiện có từ quét sản phẩm, bổ sung bằng chứng, cập nhật chi phí, đánh giá điều kiện đến đưa vào danh sách thử bán. Dữ liệu người dùng đã nhập được giữ khi quét lại. Mỗi đầu vào quan trọng có nguồn, thời điểm và trạng thái xác minh; thiếu dữ liệu được hiển thị rõ.

App hiển thị riêng điểm ưu tiên sàng lọc và kết quả kiểm tra điều kiện thử bán. Điểm sàng lọc không vượt qua điều kiện loại trừ hoặc thiếu bằng chứng. Các trạng thái kết luận là “Cần xác minh”, “Chưa đạt điều kiện” và “Đủ điều kiện thử bán”. Kết luận cuối cùng chỉ được tính từ hồ sơ đã bổ sung các bằng chứng cần thiết.

Giai đoạn này cho phép nhập bằng chứng thị trường và báo giá thủ công, có cấu trúc. Người vận hành có thể hoàn thành hồ sơ mà chưa cần kết nối thêm dịch vụ bên ngoài.

## User Stories

1. As an operator, I want dashboard actions to work in the installed Chrome extension, so that I can inspect products, edit costs and manage my watchlist.
2. As an operator, I want an edit to persist after reload, so that I do not need to enter the same information again.
3. As an operator, I want rescanning a product to retain its manually entered 1688 cost, so that market refreshes do not destroy my sourcing work.
4. As an operator, I want rescanning to retain watchlist membership and evidence, so that my research decisions remain intact.
5. As an operator, I want current Coupang observations to refresh independently of my saved inputs, so that I can see a new sales price without losing my supplier quote.
6. As an operator, I want each important value to show whether it is observed, estimated, manually entered or supported by evidence, so that I understand its reliability.
7. As an operator, I want source links and observation dates, so that I can revisit the evidence behind a value.
8. As an operator, I want missing rank, rating and review data to display as unknown, so that fabricated defaults do not influence my decision.
9. As an operator, I want listing position distinguished from verified bestseller rank, so that normal search order is not treated as sales demand.
10. As an operator, I want a provisional score clearly identified, so that I can use estimates for exploration without treating them as verified results.
11. As an operator, I want all blocking conditions and missing evidence listed, so that I know the next research step for each product.
12. As an operator, I want a product with unresolved certification risk to remain pending verification, so that a high score does not imply it is ready to sell.
13. As an operator, I want a loss-making product marked as not eligible, so that it cannot receive an encouraging final recommendation.
14. As an operator, I want to record the previous year's peak monthly searches and seasonality evidence, so that I can assess demand for the actual product keyword.
15. As an operator, I want to record Rocket counts and the sample inspected, so that I can evaluate the share of fast-delivery competitors.
16. As an operator, I want seller-specific international-delivery reviews separated from product reviews, so that I can check evidence relevant to my operating model.
17. As an operator, I want the research price profile applied to the target selling price, so that low-priced products are not automatically promoted by the current 20,000 KRW threshold.
18. As an operator, I want to record a documented review for products priced between 50,000 and 100,000 KRW, so that a borderline candidate requires an explicit economic justification.
19. As an operator, I want a supplier URL, variant, unit price, quantity and minimum order quantity attached to my quote, so that the price refers to the product I intend to buy.
20. As an operator, I want a shipping quote, weight, dimensions and delivery estimate saved with the product, so that bulky products are not evaluated as a default 300g parcel.
21. As an operator, I want buying-agent fees, platform fees, advertising and expected returns included in saved economics, so that the stated margin reflects my actual assumptions.
22. As an operator, I want zero advertising or return allowance accepted as an explicit input, so that zero is not replaced by a hidden default.
23. As an operator, I want missing costs distinguished from explicit zero, so that incomplete calculations do not look complete.
24. As an operator, I want changes to costs or evidence to update the assessment everywhere, so that dashboard, side panel and product widget agree.
25. As an operator, I want the simulator to load the product's saved assumptions and let me explicitly save a scenario, so that temporary experiments do not silently overwrite my baseline.
26. As an operator, I want favorable, base and adverse scenarios identified as assumptions, so that a scenario is not mistaken for a supplier's actual quote.
27. As an operator, I want working-capital calculations to use my order volume and settlement assumptions, so that I can estimate cash needs without a fixed capital limit.
28. As an operator, I want existing products retained during the data upgrade, so that I keep all prior research and watchlist entries.
29. As an operator, I want backup and restore to preserve evidence and financial assumptions, so that a backup restores the full product dossier.
30. As an operator, I want invalid imports and failed saves reported clearly, so that the app does not claim success when my data was not stored.
31. As an operator, I want to filter products by verification status and outstanding conditions, so that I can focus on the next research task.
32. As an operator, I want the app to explain that eligibility means ready for a controlled sales trial, so that I do not confuse it with demonstrated profitable sales.

## Implementation Decisions

- The implementation order is functional Chrome interactions and preservation of edits; data provenance and migration; shared economics and eligibility; evidence-entry and cross-view presentation. These are stages of one feature, not separate scoring systems.
- Retain the Chrome Manifest V3, local-storage architecture and existing dashboard, side panel and Coupang widget. Existing modules for storage, financial calculations, WPI, keyword risk rules and DOM extraction will be modified. No framework migration is required.
- Use the storage repository's existing public product operations as the main interface for product lifecycle behavior. Its enrichment operation delegates calculation to the existing financial and assessment modules. All views consume the same resulting financial, screening and eligibility fields. Avoid introducing a second evaluator in the widget or simulator.
- Replace inline event handlers with registered JavaScript listeners. User-supplied or imported text is displayed as text, and links are validated before rendering. These changes are required for working interactions and reliable evidence entry.
- Product identity uses a nonempty Coupang product ID; keep the existing internal ID when matching a scan to a saved product. Vendor item IDs identify offers and are not evidence of Buy Box ownership. Imports without an adequate identity are rejected with a clear explanation rather than matching unrelated products.
- Separate observed market fields from user-owned sourcing, financial, research and watchlist fields. Rescans refresh observed fields when data is present. Missing observations do not erase a previously saved value or turn unknown Rocket status into confirmed non-Rocket status. A scan never upgrades provenance or verification.
- Preserve manual and evidence-supported inputs, watchlist membership and internal identity on both single-product saves and batch imports. A newly generated estimate does not overwrite a saved manual price. Changing the baseline supplier quote is an explicit edit. Existing research grouping is retained when a rescan only refreshes market observations.
- Financial and research edits use the same serialized storage mutation path. A completed save includes the corresponding assessment. Storage errors do not produce success notices. Notify open extension views of completed updates so their product and statistics displays refresh.
- Introduce a versioned product schema with observation metadata, sourcing inputs, economic assumptions, research evidence and the derived assessment. Each important datum carries a value, provenance category, timestamp when known and a source reference when available. Verification is an explicit user action supported by saved evidence; entering a number alone does not verify it.
- Provenance categories distinguish observed DOM data, heuristic estimates, manual entries, evidence-supported entries and legacy values with unknown provenance. The seed prices are legacy estimates unless their source evidence is actually present. Do not invent timestamps or supplier URLs for older records.
- Migrate existing records without losing product identities, user costs, watchlists or custom information. Preserve old calculated results only as legacy results, visibly distinct from a current assessment. Recompute current derived fields after migration, once per schema version. Migration and reload are idempotent.
- Extraction returns unknown for fields it cannot read. Remove invented rank, rating and review count on detail pages. Search-list position is retained as list position with page context and collection time, not automatically as bestseller rank. Missing price or an unusable identity causes a clear scan result rather than an apparently complete product.
- A heuristic 1688 price may be retained for an explicitly labeled simulation. The app does not claim it is a fetched supplier price. The sourcing dossier supports supplier URL, quote date, variant/specification, unit price in CNY, quantity, minimum order quantity and user verification. The verification action requires the operator to attest that the quote applies to the intended variant and quantity.
- Financial inputs include target selling price, CNY/KRW exchange rate, supplier unit cost, buying-agent cost, platform commission, quoted shipping or an explicitly labeled weight-based estimate, product weight/dimensions, advertising per order, expected return/loss allowance and other explicitly entered per-order costs. Explicit zero is valid; missing values remain missing. Negative costs, invalid rates, nonfinite numbers and invalid quantities are rejected.
- Calculate sales proceeds, each cost line, contribution before advertising, contribution after advertising and returns, and their margins using a shared financial result. Eligibility uses the margin after all entered operating costs. Round display amounts consistently without accumulating intermediate percentage-rounding errors. A target maximum sourcing cost uses the same fees, exchange rate and target margin as the baseline calculation.
- The buying-per-order profile has no Rocket Growth warehousing cost unless the operator explicitly selects that fulfillment model. A competitor's Rocket badge does not select the operator's own fulfillment model. Keep working-capital and risk-scenario calculations as transparent assumptions; saving a baseline is distinct from editing a temporary scenario.
- Retain the existing WPI weights as a screening heuristic in this spec; do not replace them with the previous web app's 30/25/25/20 formula. Observed listing position cannot supply verified BSR demand points. A keyword-rule KC result is a risk signal, not evidence of exemption.
- Show complete numeric WPI only when all of its component inputs are present. Estimated financial inputs make it provisional. When a component is unknown, show the available breakdown and missing components rather than silently granting default points or normalizing the known points to 100. Raw score tiers describe screening priority; they are not a final Win recommendation.
- The final assessment has three states: needs verification, not eligible, and ready for trial. A confirmed failed requirement or a nonpositive complete contribution margin yields not eligible. Otherwise unresolved requirements yield needs verification. Ready for trial requires every applicable requirement to pass and the intermediate-price review, when applicable, to be documented. A high WPI never overrides this state.
- The research profile records the agreed thresholds: previous-year peak monthly absolute searches at least 10,000; Rocket share below 70% in a documented relevant Coupang sample; at least 30 seller-specific reviews for a comparable international-delivery offer; preferred target price at least 100,000 KRW, with 50,000–under 100,000 KRW requiring a documented review; and margin after the baseline operating costs at least 25%. Below 50,000 KRW fails this research profile. These are project screening rules and are shown as such, not universal claims about the market.
- Demand evidence includes the product keyword, geography, period, source and units. A normalized trend index cannot satisfy an absolute-search threshold. Seasonality must be reviewed for the product or relevant keyword, with the operator's finding recorded; category-level seasonality alone does not verify product-specific demand.
- Rocket evidence includes relevant keyword/category, inspection time, number of results inspected and number with Rocket Delivery or Growth. Require a positive sample and Rocket count no greater than sample size. The app computes the percentage from those counts. An individual product's badge cannot satisfy this requirement.
- Seller evidence includes a comparable offer link, seller identity, international-delivery observation, seller-specific review count and inspection date. Product review count is a separate field and cannot satisfy the seller criterion.
- Sourcing and fulfillment readiness requires a quote applicable to the intended variant/quantity, a shipping cost basis, a delivery estimate and a reviewed return arrangement. KC or other keyword risk remains unresolved until the operator records supporting review evidence; merely finding no sensitive keyword cannot clear readiness. This is an evidence workflow, not an automated legal-certification service.
- Evidence criteria expose pass, fail, unknown or review-required states with reasons. Allow the operator to correct evidence and explicitly record the intermediate-price review, but provide no generic switch that silently bypasses failed requirements. The assessment shows when it was computed and which profile it used.
- A dossier section records evidence and outstanding actions. Dashboard, side panel and widget clearly distinguish screening score, financial scenario and trial eligibility. Summary counts and filters use the new assessment states; legacy Diamond counts must not imply readiness. Unknown values display as unavailable rather than zero.
- Extend export/import to support a versioned backup of complete product dossiers while continuing to accept the existing array format. Validate before writing and preserve provenance. Old backups cannot automatically claim verification. Invalid imports leave the existing collection intact. Re-importing a current backup restores original grouping and saved user fields.

## Testing Decisions

- Primary seam: public product lifecycle operations on the storage repository, with the financial and assessment modules behind it. Test externally visible saved and returned product dossiers: import, read, edit, rescan and read again. Use an in-memory adapter for Chrome storage in these tests; do not assert private helpers, internal call counts or serialized implementation details.
- Additional necessary seam: user interactions in an installed Manifest V3 extension with its real default CSP and storage. A normal web page with mocked extension APIs is insufficient to verify dashboard buttons and cost edits. Use deterministic Coupang-like listing/detail fixtures for extraction and widget checks; public live Coupang is a supplementary manual check and not the only regression source.
- The project has no existing automated test suite or package-based test setup. Existing Node-compatible exports allow repository and calculation regression tests with a small native test harness. Choose the minimum browser tooling required for the Chrome extension checks rather than migrating the app's build architecture.
- Migration tests start from representative old records, including manually edited COGS, watchlists and missing fields. Migration preserves them, marks unverifiable legacy values honestly, recomputes assessment and does not change the result on a second run.
- Preservation acceptance: saving price 21 CNY and watchlist true, then importing a scan with estimated price 20 CNY and watchlist false, retains 21 CNY, the user's watchlist, internal ID and evidence, while updating the observed Coupang price. Exercise both single-product and batch paths and two closely spaced independent edits.
- Unknown-data acceptance: a detail-page fixture without rating, review count or verified rank produces unknown values. A normal search listing never produces verified BSR evidence. An unavailable Rocket badge does not establish a non-Rocket competitor.
- Eligibility acceptance: the previously reproduced high-risk 85-point case cannot be ready for trial without supporting risk review; the negative-margin 56.5-point case is not eligible. A complete passing dossier is ready for trial; removing its shipping or demand evidence makes it need verification; a confirmed failed requirement makes it not eligible.
- Profile boundary acceptance: absolute search volume 10,000 passes; Rocket share 70% fails and a smaller share passes; seller review count 30 passes while product review count alone does not; price 100,000 passes the price criterion, price 50,000 requires review and a lower price fails; complete margin 25% passes and a lower margin fails. Assert criterion results and reasons, not incidental UI formatting.
- Economics acceptance: a heavy product uses its saved shipping basis rather than default 300g; explicit zero advertising or return allowance remains zero; missing costs keep readiness incomplete; advertising and return costs affect the final contribution and eligibility. Dashboard, simulator and widget show the same baseline for the same saved product. Editing a temporary scenario leaves that baseline intact until an explicit save.
- Quote acceptance: a manual estimate is usable for simulation but does not satisfy quote verification. Attaching the required variant/quantity and source evidence permits explicit user verification. Rescanning cannot change that verification state.
- Backup acceptance: export and restore round-trip full dossiers, watchlist, provenance and grouping. Existing array backups still import with conservative legacy provenance. Invalid records or malformed metadata cause a clear error with no partial mutation.
- Installed-extension acceptance: edit COGS, toggle watchlist, open Inspector and Simulator, save evidence, reload, rescan and inspect again. Values persist and the views refresh; the console has no inline-script CSP violations from these interactions. Links and imported text cannot create executable inline handlers.
- Failed-write acceptance: simulate a storage failure and verify a visible save error, no success message and no false locally committed assessment. Run the meaningful lifecycle, calculation and browser checks for the implemented slice; expand checks only for a remaining identified risk.

## Out of Scope

- Fetching live 1688 supplier prices, bypassing authentication or automating supplier contact.
- New Naver, ItemScout, Google Trends or paid market-tool integrations. Structured manual evidence entry is included.
- Rebuilding the previous Node web app, moving to a new framework, cloud synchronization or multi-user accounts.
- Training a sales-prediction model, claiming proven winning products, or calibrating scoring weights against real sales outcomes.
- Automated legal certification, guarantees about Buy Box ownership or guarantees about delivery and settlement timing.
- Marketplace publishing, order execution, purchasing inventory or placing a supplier order.
- A fixed five-million-VND capital constraint; capital is modeled from operator assumptions.
- Creating implementation tickets in this step; the next planning step can split this spec into dependency-aware tickets.

## Further Notes

- The research chat also discussed a different application with a different score formula. Its implementation is not evidence that the current extension already implements those criteria. This spec carries over the documented research criteria and buying-per-order model while making the extension's own scoring limits explicit.
- The reproduced baseline cases were KC HIGH with otherwise favorable inputs yielding Diamond at 85, and a negative-margin product yielding Silver at 56.5. A repository workflow also demonstrated that rescanning replaced manual COGS and removed watchlist membership. These are concrete regression cases for this feature.
- Staged rollout should make existing records conservative: legacy prices and review data are not automatically upgraded to verified evidence. Users can continue to explore and simulate while completing their dossiers.
- The user confirmed the proposed storage-repository lifecycle and real Chrome extension testing seams before publication. This spec is ready for agent implementation; implementation work is a subsequent task.
