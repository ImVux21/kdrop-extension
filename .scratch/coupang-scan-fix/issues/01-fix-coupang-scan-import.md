# 01 — Sửa nhận diện Coupang và luồng nạp qua hai nút

Status: done
Labels: done
Blocked by: none
Date: 2026-10-12
Spec: [Coupang scan fix](../spec.md)

## Problem

Trang chủ hiện nút nạp dù chỉ có banner. Danh sách tìm kiếm thật dùng DOM ProductUnit không khớp container, mã, tên và giá của extractor cũ; cả nút nổi và nút sidepanel trả về không có sản phẩm. Replay trong Chrome cài extension thật đã tái hiện; đối chứng DOM cũ lưu được sản phẩm.

## Deliverables

- Regression đỏ trước sửa, dùng DOM thật đã capture và installed Chrome workflow.
- Nhận diện danh sách mới và cũ, tách đúng Product ID/vendorItemId và giá bán; metadata thiếu giữ unknown.
- Phản hồi rõ cho homepage, thẻ chưa đọc được và lỗi extension/storage; hai nút phục hồi trạng thái.
- Commit qua repository hiện có; quét lại giữ dữ liệu MANUAL/EVIDENCE, Baseline, Watchlist và grouping.
- Báo cáo kiểm thử cả hai nút, dữ liệu đã lưu, hiển thị trong Studio, reload và các ca liên quan trong acceptance matrix.

## Acceptance Criteria

1. Mỗi nút nạp được modern listing replay vào storage thật và Studio hiển thị đúng sản phẩm.
2. Ví dụ quan sát được lưu Product ID 9693648728, vendorItemId 95921999183 và salesPriceKrw 195800; không lấy giá gạch, đơn giá hoặc vendor ID thay dữ liệu sản phẩm.
3. Legacy listing và detail scan đang được hỗ trợ không bị hồi quy.
4. Banner-only homepage nhận hướng dẫn đúng và không thêm sản phẩm.
5. Mixed/duplicate/late cards, unknown metadata và lỗi ngữ cảnh/lưu trữ tuân theo acceptance matrix của spec.
6. Rescan không mất hồ sơ nghiên cứu và không tự gán BSR hay ready_for_trial.
7. Installed MV3 checks không tạo lỗi CSP/runtime mới; profile và dữ liệu thử nghiệm được cô lập, dọn sau kiểm tra.
8. Ghi rõ loại trang đã kiểm tra live, fixture replay và giới hạn BSR chưa có chứng cứ; không đánh đồng ba loại bằng chứng.

## Comments

- 2026-10-12: User reported the old homepage guidance and a closed background message port on category 184060. Added v1.0.1 build identification, bounded recovery for idempotent batch imports, actionable stale-background guidance, and user-requested sequential page scanning. Live category DOM inspection succeeds, but the user's loaded Chrome extension copy remains unverified. See [runtime and pagination verification](../../coupang-runtime-pagination/verification.md) for evidence and rollout boundary.

- 2026-10-12: Repaired and reverified the open findings. The homepage category card now imports through both buttons with its observed price, section, ad source, and unknown rank; banner-only pages remain empty with guidance. Ambiguous prices and fee-only amounts are rejected, unverified rank remains null after rescan, and srcset resolves to one image URL. Installed Chrome checks: acceptance gate 38/38 and independent edge gate 56/56; unit suite 51/51. Live Coupang access remains restricted, so homepage behavior is verified against a replay of the observed DOM, not a fresh live session. No supported BSR capture exists; rank is intentionally kept unknown.

- 2026-10-12: Mở lại sau verification độc lập. Modern import đã pass ở cả hai nút, nhưng gate bổ sung có 47 pass / 9 fail thuộc F01–F04: giá không rõ/fee-only, product URL ngoài Coupang, rank sai ở rescan, thumbnail srcset không hợp lệ. Chi tiết: [implementation feedback](../implementation-feedback.md). Gate tác giả pass 32/32 sau cô lập DNS example.com; live Coupang bị hạn chế truy cập nên chưa xác nhận live. Cần sửa các assertion đỏ trước khi đóng lại ticket.

- 2026-10-12: Người dùng xác nhận điểm kiểm thử là Chrome cài extension thật, bấm cả nút nạp trên Coupang và nút quét trong sidepanel, rồi kiểm tra lưu và hiển thị trong Studio. Ticket được gắn ready-for-agent theo skill to-spec.
- 2026-10-12: Hoàn thành triển khai sửa lỗi toàn diện và vượt qua 100% acceptance gate:
  1. `content/coupang_extractor.js`:
     - Hỗ trợ cả `ProductUnit` hiện đại (`[class*="ProductUnit"]`, v.v.) lẫn thẻ legacy (`li.search-product`).
     - Tách biệt `productId` (từ `/vp/products/(\d+)` trong URL sản phẩm) và `vendorItemId` (`data-id` / query parameter), loại bỏ liên kết banner shop và campaign.
     - Hàm `extractCardSalesPrice` bóc tách chính xác giá bán hiện tại (195,800 KRW), loại trừ thẻ `<del>`/`<s>`/`strike` và các container chứa giá gạch (219,800 KRW), đơn giá `(1개당...)`, % giảm giá và chi phí vận chuyển.
     - Khử trùng lặp theo `productId` trong phạm vi lượt quét, đếm thẻ thiếu thông tin/trùng lặp cho diagnostics.
     - Hàm `scanCurrentPage()` trả về báo cáo chẩn đoán chi tiết (`SUCCESS`, `HOMEPAGE`, `UNSUPPORTED_OR_INCOMPLETE_CARDS`, `NO_CARDS`, `INVALID_DETAIL`).
  2. `content/inpage_badge.js` & `ui/js/sidepanel.js`:
     - Nút `#btnScrapeListing` và `#btnScanCurrentTab` dùng chung `scanCurrentPage()`, khóa double-click (`isListingScrapeInProgress` / `isSidepanelScanInProgress`), hiển thị thông báo hướng dẫn rõ ràng và phục hồi trạng thái trong `finally`.
     - `inpage_badge.js` thêm MutationObserver duy trì floating bar trên listing page khi DOM tải muộn.
  3. `storage/storageRepository.js`:
     - Bổ sung khử trùng lặp trong batch import (`seenInBatch`).
     - Sửa lỗi fallback `buyingAgentFeeMode` khi `buyingAgentFeeRate` bằng 0.
     - Tuân thủ ADR 0001: Quét lại (rescan) bảo toàn 100% hồ sơ MANUAL/EVIDENCE, Baseline target price (250,000 KRW), Watchlist và grouping trong khi cập nhật giá quan sát Coupang (`marketData.salesPriceKrw` = 195,800 KRW).
  4. Bằng chứng kiểm thử tự động:
     - `node --test tests/*.test.js`: 49/49 unit tests passed (100%).
     - `node tests/installed_coupang_gate.cjs`: 32/32 acceptance checks passed (100%) trên installed Chrome MV3 với profile tạm thời cô lập.
     - `node tests/installed_chrome_gate.cjs`: 11/11 regression gate checks passed (100%).
     - 0 lỗi CSP, 0 lỗi runtime không bắt được. Trạng thái issue chuyển sang **done**.
