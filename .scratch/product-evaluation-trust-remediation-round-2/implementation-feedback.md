# Nhận xét cho Antigravity: review vòng hai

Date: 2026-10-12
Related spec: ./spec.md
Previous feedback: ../product-evaluation-trust-remediation/implementation-feedback.md
Scope: F01–F09 của review vòng hai; tài liệu bàn giao, không phải implementation.

## Những sửa chữa cần giữ

- KC LOW không còn tự pass; evaluator yêu cầu supporting review.
- Target price được giữ khi quét lại và tách khỏi observed price trong save economics.
- Restore có logic riêng cho user fields của sản phẩm tồn tại.
- Manual COGS edit hủy verification; margin/competition thresholds dùng ratio trước làm tròn.
- Mutation facade đã delegate phần lớn edit operations tới service worker; widget đã resolve saved product.
- Suite tăng từ 19 lên 26 tests và hiện đều pass.

Đây là tiến bộ thực tế. Các failures còn lại xuất hiện ở nhánh upgrade, boundary validation, phối hợp các API và việc truyền full baseline tới view/helper. Cần kiểm chứng các hợp đồng đó trước khi tuyên bố hoàn tất.

## Findings và bằng chứng

Các vị trí dưới đây là starting points của snapshot đã review. Kiểm tra lại sau mỗi thay đổi; yêu cầu bền vững nằm trong spec/ADR.

| ID | Ưu tiên | Starting points | Bằng chứng review và yêu cầu sửa |
| --- | --- | --- | --- |
| F01 | P1 | `storage/storageRepository.js:183`, `:597`, import new-record branch `:1168` | Old schema v2/cache ready vẫn trả ready khi evidence bị thiếu; fresh enrichment trả needs_verification. Restore vào collection rỗng cũng giữ cache. Recompute/version derived results cho mọi branch; không trust imported/cached assessments. |
| F02 | P1 | `storage/storageRepository.js:552`, `:602` | Promise.all của edit legacy cost 100 → 222 và read/migrate hoàn tất nhưng final cost 100. Snapshot được lấy trước queue; init/migration còn write trực tiếp trong clients. Mọi write vào authority, read latest bên trong operation. |
| F03 | P1 | `storage/storageRepository.js:1139`, `:1180` | Backup cost 999 với categories sai kiểu làm import throw, nhưng products đã đổi từ 150 → 999. Validate toàn payload/metadata và commit related keys cùng một operation. |
| F04 | P1 | `core/feeCalculator.js:379`, `core/winAlgorithm.js:588` | Bỏ quote amount/source, weight, exchange, commission, agent/other cost vẫn financial.isComplete true và ready_for_trial với basis QUOTED. Không dùng simulation defaults để complete actual baseline; fulfillment cần supported amount/basis. |
| F05 | P1 | `ui/js/dashboard.js:727`, `storage/storageRepository.js:916` | DOM-controller reproduction: canonical profit 29,500 nhưng untouched simulator 53,100 vì bỏ custom fees/returns. Baseline save nhận platform commission/dimensions mà không persist. Pass full effective baseline và round-trip mọi supported input. |
| F06 | P2 | `storage/storageRepository.js:732`, import validation `:1139` | Public sourcing save persist cost -5, quantity -1, date not-a-date. Clearing verification không thay cho rejection. Validate provided terms và metadata trước write trên save/import. |
| F07 | P2 | `storage/storageRepository.js:257–262` | Explicit commission 0 thành 0.11; ship 0 thành null rồi 3,000; agent rate 0.1 bị injected flat 0 che, resulting agent cost 0. Presence-aware migration và explicit fee basis. |
| F08 | P2 | `core/feeCalculator.js:470`, `:487–492` | Same full inputs: profit pre-ad 39,100 nhưng unit economics 46,200 vì tự tính reserve và bỏ CGF. Cap 273 CNY hứa margin 30% nhưng full margin chỉ 5.2%. Dùng canonical cost lines cho mọi helper/recommendation. |
| F09 | P2 | `storage/storageRepository.js:161`, `content/inpage_badge.js:113` | Widget lắng runtime message nhưng publisher dùng runtime.sendMessage, không relay tới content script hay storage change listener. Đây là static/API-contract finding; nghiệm thu trên installed Chrome. |

## Phân biệt mức độ kiểm chứng

- F01–F04 và F06–F08 có ca tái hiện trực tiếp trong bộ nhớ qua public APIs/calculators; không dùng dữ liệu thật của người vận hành.
- F05 có kết quả từ controller chạy với DOM mô phỏng, cùng static inspection của inputs/save contract. Nó chứng minh lỗi truyền financial inputs nhưng không thay thế real Chrome gate.
- F09 được đối chiếu static flow và API contract chính thức. Chrome ghi rõ runtime.sendMessage không gửi từ extension tới content scripts; dùng tabs messaging hoặc storage change path phù hợp. [Chrome runtime.sendMessage documentation](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-sendMessage).
- 26 test hiện tại pass chỉ chứng minh các cases hiện có. Review không chạy lại extension thật; không dùng stored browser reports như current validation.
- Git chỉ có empty initial commit; các nhận xét đối chiếu snapshot với spec, không khẳng định attribution của từng dòng cho một commit cụ thể.

## Chi tiết dữ liệu để viết regression

### Current versus cached assessment

Tạo/khôi phục một hồ sơ schema v2 có cached ready_for_trial nhưng inputs/evidence chưa đủ theo rules hiện tại. Đọc qua public API và import vào collection rỗng lẫn existing-record branch. Expected decision phải đến từ current inputs/rules. Cần kiểm tra cả summaries/filters/widget, không chỉ trực tiếp gọi enrichProduct và bỏ qua public read path.

### Migration/edit race

Legacy record cost 100; bắt đầu edit thành 222 gần thời điểm read-triggered migration. Sau khi hai operation hoàn tất, final read/reload phải cost 222. Chạy các ordering khác nhau và independent clients; queue test trên new-schema singleton không bao phủ nhánh migration này.

### Restore failure

Export backed-up dossier, thay field trong backup để dễ phát hiện mutation, cung cấp categories sai kiểu hoặc malformed metadata. Import phải reject trước commit. So sánh đầy đủ products/categories trước và sau; không chỉ assert rằng có exception. Thêm failed-write case của complete commit.

### Full simulator baseline

BUYING_PER_ORDER; revenue 110,000; supplier 150 CNY; rate 190; commission 20%; flat agent 5,000; other 2,000; quoted shipping 3,000; ads 10,000; fixed return reserve 10,000. Saved profit là 29,500. Untouched simulator phải bằng 29,500, không dùng commission 11%, agent/other zero hoặc rate-based returns 3,300.

Thêm ROCKET_GROWTH 400 vào cùng inputs: pre-ad contribution phải là 39,100 ở cả profit và unit economics. Nếu return rate 3% vẫn có trong persisted legacy inputs, normalize theo selected fixed mode; không âm thầm đổi mode giữa helpers.

### Target sourcing-cost recommendation

Dùng cùng ROCKET_GROWTH baseline, requested margin 30%, commission 20%, rate 190, ship 3,000. Old helper gợi ý 273 CNY nhưng full calculator cho 5.2%. Test mới phải substitute recommended amount vào full current calculator và assert actual margin đạt target tại quote precision đã chọn; không chỉ kiểm tra helper trả một số dương.

## Nhận xét về cách implement cần cải thiện

### 1. Hoàn tất upgrade path trước khi chỉ kiểm tra new fixtures

Rules đã sửa nhưng SCHEMA_VERSION/fast path giữ old ready, old financial và rank alias. Derivative fixes không có tác dụng cho người dùng cũ nếu public reads không invalidate/recompute chúng. Lập rõ data version, assessment revision và các trường historical provenance không thể khôi phục. Dùng fixture từ bản trước trong regression.

### 2. Một writer phải bao phủ mọi nơi có thể ghi

Đã delegate ordinary edits nhưng init/read-triggered migration vẫn write ngoài authority. Đánh dấu tất cả operations có side effects, kể cả “read” path. Sau khi vào queue mới lấy snapshot; không dùng captured stale collection. Kiểm tra guarantee trên success acknowledgment: edit đã thành công không được biến mất sau migration.

### 3. Validation và atomicity là hai yêu cầu khác nhau

Validate IDs không phải validate dossier; throw sau khi write không phải all-or-nothing. Build complete restore state, validate every supplied type/value/category, rồi commit một lần. Test phải assert state unchanged sau lỗi, không chỉ assert rejection. Chốt điều này cả ở data adapter và UI save path.

### 4. Defaults phải có ý nghĩa sản phẩm rõ ràng

Flat fee 0, commission 11%, weight 300g hữu ích để mô phỏng nhưng không chứng minh actual costs. Đừng làm mất thông tin “missing” trước khi xác định completeness. Áp presence-aware semantics xuyên migration → normalizer → calculator → UI → restore; tránh sửa một chỗ rồi để chỗ khác tiếp tục dùng truthiness.

### 5. Đừng coi form-save API test là simulator integration test

New saveBaseline test chỉ assert một subset fields; UI tính bằng subset khác; dimensions/platform bị bỏ. Test round-trip phải dùng nondefault fees, fixed returns và dimensions để làm lỗi omission lộ ra. So sánh untouched baseline, preview, save response và reloaded result bằng cùng input set.

### 6. Một financial result cần thật sự được tái sử dụng

Unit helper gọi calculateProfit nhưng sau đó tự dựng khác return reserve/variable cost. Target helper vẫn trừ ít cost lines hơn main model. Nếu helper đưa ra cùng loại kết luận kinh tế, nó phải dùng cùng applicable costs hoặc nói rõ assumptions khác. Dùng arithmetic invariants và substitute-back tests để tránh duplicated formula drift.

### 7. Confirm notification delivery theo Chrome context

Thêm listener vào widget chưa chứng minh sender có thể gửi tới nó. Xác định sender/receiver context, chọn API đúng, rồi kiểm tra commit từ dashboard khi widget đang mở. Manually invoking a mock callback chỉ kiểm tra handler, không kiểm tra platform delivery.

### 8. Đóng việc theo traceability, không theo số lượng tests

Review vòng hai vẫn thấy các nhánh đã được nêu trong corrective spec đầu nhưng chưa được kiểm tra: old schema2, empty restore cache, multi-key failure, missing costs, simulator full assumptions và actual widget refresh. Dùng F01–F09 acceptance matrix, thêm expected/actual evidence và ghi gate chưa chạy. Không bỏ qua first-round regressions sau khi sửa second-round issues.

## Bàn giao Antigravity cần trả lại

1. Bảng F01–F09: requirement, regression/check, expected, actual, pass/fail/blocked/not-run.
2. Cách xử lý old schema v2, stale assessments/rank và default-filled inputs; trường nào giữ, field nào cần người dùng xác nhận lại.
3. Bằng chứng public API lifecycle, migration race, failed restore state preservation và full simulator preview/save/reload.
4. Kết quả installed Chrome checks cho two-view mutations, real CSP, reload và dashboard-to-widget refresh trên temporary data.
5. Current revision/snapshot và commands/setup dùng cho kiểm chứng; limitations chưa giải quyết.

## Prompt có thể đưa nguyên văn cho Antigravity

> Hãy implement `.scratch/product-evaluation-trust-remediation-round-2/spec.md` và đọc implementation-feedback.md cùng thư mục trước khi sửa. Giữ các hợp đồng của spec gốc, corrective spec vòng đầu, GLOSSARY và ADR. Ưu tiên old schema v2/cached assessment, migration authority và atomic restore trước khi hoàn thiện full financial inputs, simulator và widget refresh. Thêm regressions F01–F09 dựa trên public saved lifecycles, không chỉ new fixtures hoặc helper calls. Test simulator với custom fees/fixed returns/dimensions; substitute recommended sourcing cost vào canonical calculator để chứng minh target margin. Chạy installed Chrome gate cho actual notification delivery và cross-view behavior. Bàn giao finding-to-check report với current results và mọi gate chưa chạy. Không mark completed chỉ vì 26 hoặc nhiều hơn Node tests pass khi mandatory acceptance còn fail/not-run.
