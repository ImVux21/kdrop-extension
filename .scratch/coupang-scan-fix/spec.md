# K-Drop Studio: Sửa luồng quét Coupang và nạp sản phẩm

Status: ready-for-agent
Labels: ready-for-agent
Date: 2026-10-12
Testing seam: installed Chrome MV3, cả nút nạp trên Coupang và nút quét sidepanel; người dùng đã xác nhận.

## Problem Statement

Người vận hành bấm nạp sản phẩm Coupang vào K-Drop Studio nhưng nhận thông báo không có sản phẩm. URL được cung cấp là trang chủ Coupang. Trong phiên quan sát, trang chủ chỉ có banner chiến dịch/cửa hàng, không có liên kết sản phẩm hợp lệ; extension vẫn hiện nút nạp và thông báo rỗng chung chung.

Lỗi còn xảy ra trên trang có sản phẩm: trang tìm kiếm thật với từ khóa 수납함 có 112 liên kết sản phẩm nhưng không thẻ nào khớp selector hiện tại. Bộ quét phụ thuộc DOM cũ ở container, Product ID, tên và giá. Thẻ mới dùng ProductUnit; Product ID nằm trong URL sản phẩm, còn data-id của thẻ được quan sát là vendorItemId.

Hai nút nạp dùng cùng extractor nên cùng chịu ảnh hưởng. Đối chứng trong Chrome cài extension thật xác nhận một danh sách DOM cũ nạp được một sản phẩm. Ở replay DOM mới, kết quả trích xuất rỗng và thao tác lưu chưa được gọi. Cần sửa nhận diện và phản hồi giao diện, đồng thời kiểm chứng luồng nạp thực tế.

## Solution

Người vận hành mở danh sách Coupang có sản phẩm, bấm một trong hai nút và nhận kết quả nạp đúng. Bộ quét hỗ trợ cấu trúc hiện tại đã quan sát và giữ tương thích danh sách cũ; sản phẩm được lưu qua repository hiện có và xuất hiện trong Studio.

Trang chủ hoặc trang không có sản phẩm cung cấp hướng dẫn mở danh sách tìm kiếm, danh mục hoặc chi tiết sản phẩm. Banner không được nhập thành sản phẩm. Trang có thẻ sản phẩm nhưng không đọc đủ dữ liệu phải được phân biệt với trang không có thẻ và với lỗi thực thi/lưu trữ. Các thao tác có trạng thái kết thúc rõ ràng và cho phép thử lại sau khi trang tải hoặc extension được reload.

Dữ liệu thị trường được ghi theo OBSERVED khi có chứng cứ DOM. Tìm kiếm thông thường chỉ có listingPosition và ngữ cảnh, không được tự gán BSR. Quét lại bảo toàn hồ sơ MANUAL và EVIDENCE, Baseline và Watchlist theo ADR hiện hành.

## User Stories

1. As an operator, I want to import current Coupang search results, so that visible products can be researched in Studio.
2. As an operator, I want to import supported legacy listings, so that the fix does not break pages that already work.
3. As an operator, I want the floating import button to save detected products, so that I can collect products directly from Coupang.
4. As an operator, I want the sidepanel scan button to save the same detected products, so that both entry points produce consistent records.
5. As an operator, I want scanning to target the active Coupang tab, so that products from another tab are not imported accidentally.
6. As an operator, I want Studio to display a committed import, so that a success message corresponds to usable saved data.
7. As an operator, I want saved products to survive reload, so that importing is durable.
8. As an operator, I want the actual Product ID read from its product link, so that a vendor item identifier does not create the wrong product record.
9. As an operator, I want vendorItemId retained separately, so that seller item context remains available.
10. As an operator, I want the Korean product title copied correctly, so that product research is tied to the right item.
11. As an operator, I want the current sale price captured, so that crossed-out prices, unit prices and discounts do not distort my economics.
12. As an operator, I want the product URL and available thumbnail retained, so that I can verify the imported item against its source.
13. As an operator, I want lazy-loaded thumbnails handled when their source is available, so that placeholders do not replace real product images.
14. As an operator, I want ratings and product review counts read from supported current cards, so that displayed market data matches the source.
15. As an operator, I want product reviews distinguished from seller-specific reviews, so that an import does not falsely satisfy Seller Review Criterion.
16. As an operator, I want Rocket badges interpreted only when supported by observed evidence, so that unknown delivery status is not presented as verified competition data.
17. As an operator, I want missing optional fields represented as unknown, so that the scanner does not invent ratings, reviews or supplier quotes.
18. As an operator, I want invalid cards skipped without losing valid cards, so that one incomplete item does not prevent a useful import.
19. As an operator, I want banner and campaign links excluded, so that advertising sections do not become fake products.
20. As an operator, I want duplicate cards for the same product handled consistently, so that a repeated DOM representation does not create extra records or an inflated success count.
21. As an operator, I want search order stored as listingPosition with page context, so that ordinary search results are not mislabeled as BSR.
22. As an operator, I want BSR rank to require evidence from an actual ranking page, so that an arbitrary URL or recommendation order cannot become a demand signal.
23. As an operator, I want clear guidance when scanning the homepage, so that I know which page to open next.
24. As an operator, I want a late-loaded listing to be scannable once its cards render, so that opening a page early does not permanently disable collection.
25. As an operator, I want an unsupported card layout distinguished from an empty page, so that I can understand why visible products were not imported.
26. As an operator, I want extension execution and storage failures reported accurately, so that technical failures are not disguised as no products.
27. As an operator, I want buttons restored after success or failure, so that a failed scan does not leave the UI stuck.
28. As an operator, I want repeated clicks during an import controlled, so that the same batch is not submitted concurrently from one control.
29. As an operator, I want rescans to refresh observed market fields while preserving my sourcing dossier, so that a newer price does not erase a factory quote.
30. As an operator, I want rescans to preserve evidence, Watchlist and my Baseline target price, so that collection does not undo my research decisions.
31. As an operator, I want importing observed data to retain honest assessment status, so that a successful scan alone does not assert ready_for_trial.
32. As an operator, I want a representative product detail scan to keep working, so that listing improvements do not regress the existing single-product flow.
33. As an operator, I want brief reload guidance when an existing tab has a stale or missing extension context, so that I can recover without guessing.

## Implementation Decisions

- Modify the existing Coupang extractor and the two scan entry points. Reuse the current storage repository, its service-worker mutation authority and cross-view refresh mechanism. Do not introduce an alternate writer, new storage schema, background crawl service or separate extraction implementation per button.
- Preserve the existing public extraction contracts for listing arrays and a single product. Introduce shared scan diagnostics only where necessary to let both callers distinguish supported results, no product cards, unsupported/incomplete cards and execution failure. Prefer one shared interpretation over duplicated decisions in the two UIs.
- Support observed ProductUnit cards in addition to supported legacy cards. Avoid binding recognition solely to an exact generated CSS hash. Bound title, price and metadata extraction to one product card; avoid collecting text from an entire results section.
- Derive Product ID from a validated Coupang product link when available. Resolve relative links correctly, keep vendorItemId separate, reject missing/zero/malformed identities, and reject non-product campaign/store links. Explicit legacy Product IDs remain supported when consistent with a valid product identity. Do not use an arbitrary data-id or digits from unrelated DOM identifiers as a new-layout Product ID.
- Resolve current sale price separately from original crossed-out price, discount, unit price, rewards and delivery fees. Do not concatenate numbers from the whole card. A card without an unambiguous valid positive sale price is skipped and contributes to incomplete-card diagnostics rather than producing invented economics.
- Retain supported observed title, product URL, thumbnail, rating and review count. Support current rating accessibility values and review metadata when their roles are unambiguous. Treat unavailable optional values as unknown. Do not substitute an unrelated image or count from another card.
- Maintain the existing distinction between product-level reviews and Seller Review Criterion. No import creates seller-specific evidence or a Sourcing Dossier quote. Rocket status is OBSERVED only from supported badge evidence; unknown listing status remains unknown.
- Deduplicate accepted cards by Product ID within a scan while preserving deterministic DOM order. Retain the existing product-centric storage identity. Different vendor appearances must not fabricate a merged seller dossier; use the chosen card's internally consistent vendor context. Report accepted unique products, not raw anchor count, and acknowledge success only after commit.
- Ordinary search, homepage recommendations and detail scans do not provide BSR rank. Preserve listingPosition and page context for listings. A BSR parser must rely on captured ranking-page evidence, including the distinction between ranked items and inserted ads; a path substring alone is not proof. Any ranking layout without supporting evidence must leave rank unknown.
- Keep the floating K-Drop open action available on the homepage. On a page without product cards, show a clear scan guidance state or explain on click that a product list/detail page is needed. Do not present a successful zero-product import. Allow a subsequent scan when valid cards appear later without requiring a full page reload.
- Both entry points read the current DOM at scan time. Do not cache an initial empty extraction as permanent page support. Keep scanning bounded; if cards are still loading, tell the user to wait and retry rather than introducing an unbounded observer or crawl loop.
- Handle missing/stale content-script context and Chrome scripting errors explicitly. Validate the selected tab as a permitted Coupang page before scanning; unrelated pages must receive an actionable explanation. An execution error is distinct from a successfully executed extractor returning no products.
- During a scan/import, prevent repeated submission by the same button, and restore the button state on every success, empty result or failure. Surface storage errors and do not claim success before repository acknowledgement.
- Rescans go through the existing merge contract. Preserve internal identity, MANUAL/EVIDENCE sourcing inputs and dossier, research evidence, Watchlist, grouping and Baseline target price while refreshing applicable OBSERVED market fields. Derived WPI and Trial Selling Eligibility continue to follow the existing rules; a scan is not attestation of missing evidence.
- Follow existing MV3 CSP practice with event listeners. Use safe rendering for imported titles and diagnostics; no inline event handlers or new privileged permissions are needed for this fix.

## Testing Decisions

- The primary seam is the user-visible scan/import workflow in installed Chrome MV3: real content-script execution, real Chrome tab/scripting APIs, actual repository commit, and the resulting Studio view. The user confirmed testing both the floating button and the sidepanel button on 2026-10-12. Do not mock their handlers, return canned extraction results or write expected records directly into storage to prove success.
- Reuse the installed Chrome acceptance gate approach and the existing diagnosis replay harness. Use a separate disposable profile with deterministic page replay and isolated test storage. Preserve user profiles and records.
- Capture representative real DOM fixtures with tracking details removed: current search cards, supported legacy listings, the banner-only homepage, and a supported detail page. Retain actual meaningful card structure. Include different original and unit prices so the sale-price assertion cannot pass by accidentally taking the first number.
- Extend the modern-card capture with the relevant observed metadata needed for thumbnail, rating, review and Rocket assertions. A fixture invented from the intended selector is not sufficient evidence of current-site compatibility. The existing minimal diagnosis fixture is the starting reproduction, not complete proof of all fields.
- Tests assert observable output: correct products, metadata, messages, button recovery, persisted state and view refresh. Avoid assertions that merely mirror selector strings or implementation helper names. A renamed generated class suffix with unchanged semantic card structure must not break supported extraction.
- Convert the modern-listing failure into a failing regression before changing production extraction. Replay the same card through both buttons, then rerun it after the fix. For homepage behavior, assert actionable guidance and unchanged storage; do not turn the original diagnostic expectation of importing a banner into an acceptance requirement.
- Retain current extractor, preservation and assessment tests as supporting checks. Broaden the installed workflow checks only around the affected behavior; no redesign of the financial test suite is needed.

Acceptance matrix:

| Case | Trigger | Required observable result |
|---|---|---|
| Current listing | Each button scans a replay of observed modern cards | Correct unique products committed; visible in Studio and retained after reload |
| Identity and prices | Observed example with Product ID 9693648728, vendorItemId 95921999183, original 219800, sale 195800, plus a different unit price | Product ID and vendor are distinct; sale price exactly 195800 |
| Current metadata | Observed card with valid thumbnail, rating 5 and product review count 2 | Supported metadata matches DOM; no seller-review evidence invented |
| Legacy listing | Each button scans previously supported card structure | Import continues to work |
| Homepage | Each button scans banner-only homepage replay | Useful instruction to open a product/list page; no new records; button recovers |
| Incomplete and mixed cards | Cards lacking identity/title/price mixed with valid cards | Invalid cards omitted, valid cards imported, no cross-card data mixing |
| Duplicate representations | Same product rendered more than once | One stored product; accepted count reflects unique products |
| Unknown fields | Valid card lacks rating/reviews/Rocket/supplier quote | Unknowns remain unknown; no automatic ready_for_trial assertion |
| Search ordering | Cards include ads or recommendation positions | Ordinary search rank remains null; listing context is retained |
| Late DOM | Initially empty page, then supported cards appear | Next scan imports cards correctly through each button |
| Scan context failure | Missing/stale extractor or scripting failure | Technical/reload guidance; no false empty-page diagnosis; control recovers |
| Wrong active page | Sidepanel scan while a non-Coupang tab is active | Actionable message; no scan/import of another tab |
| Storage failure | Repository commit fails under controlled fault | Visible save error; no success acknowledgement; button recovers |
| Rescan preservation | Edit sourcing/evidence/Baseline/Watchlist, change observed sale price, then scan again | New market price saved; established MANUAL/EVIDENCE and research inputs retained |
| Detail regression | Existing supported detail page scanned from sidepanel | One correct product; no fabricated rank; existing detail save flow still works |
| Repeat submission | Double-click one control while its import is in progress | One in-flight submission from that control; stable final state |
| Verified BSR, if claimed supported | Capture and replay an actual supported ranking page | Rank matches observed ranked items, does not count ads; document page/context evidence |
| Runtime safety | Run affected workflows in installed MV3 extension | No new CSP violations or unhandled errors in tested extension views/content scripts |

- A live smoke check after implementation verifies at least the current search page used during diagnosis, when reachable. Record the checked page type, date and result. Live access failure must be reported separately from deterministic replay results; replay cannot be described as a live-page pass.
- Do not claim coverage for all Coupang BSR/category variants from search-page evidence. Record the exact supported layouts. If no authentic BSR fixture can be captured, rank stays unknown and BSR support is explicitly unverified rather than inferred.

## Out of Scope

- Implementing a background crawler, paging through all results, bypassing access controls, solving CAPTCHA, or calling undocumented private APIs.
- Importing banner advertisements as product records, scraping every homepage module, or guaranteeing every Coupang layout without captured evidence.
- Treating default search ranking or a sales-sort option as verified BSR.
- Redesigning WPI, Trial Selling Eligibility, economics, backup/restore, sourcing verification or the Studio visual design.
- Completing the prior audit of every extension feature within this scan fix.
- Installing/reloading the extension in the user's browser or publishing a release as part of writing this specification.

## Further Notes

- This specification turns the completed diagnosis into an implementation-ready task. It does not claim the production bug is already fixed.
- Follow the domain glossary and ADR 0001, particularly OBSERVED versus MANUAL/EVIDENCE, rescan preservation, service-worker mutation authority and MV3 CSP.
- Diagnostic evidence and the minimized replay are retained in the adjacent homepage-scan-diagnosis tracker directory. That historical report remains unchanged.
- Publication uses the project's local Markdown issue tracker. No external issue tracker or third-party messaging is involved.
- The implementation ticket covers one complete vertical slice: detection, both controls, storage/view verification and regression evidence. No new testing seam or additional user interview is required.
