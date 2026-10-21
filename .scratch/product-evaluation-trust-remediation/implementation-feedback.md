# Nhận xét triển khai dành cho Antigravity

Date: 2026-10-12
Related spec: ./spec.md
Scope: 11 findings từ review Product Evaluation Trust; tài liệu bàn giao, không phải bản sửa code.

## Cách dùng tài liệu

Đọc spec sửa lỗi trước khi implement. Dùng R01–R11 để liên kết từng lỗi với acceptance matrix và kết quả kiểm chứng. Vị trí mã dưới đây là điểm bắt đầu của snapshot đã review; kiểm tra lại khi mã thay đổi. Các quyết định bền vững nằm trong spec và ADR, không phụ thuộc số dòng.

## Những phần đã đi đúng hướng

- Đã đưa schema/provenance, sourcing/evidence/economics và ba trạng thái eligibility vào mô hình, tạo nền tảng phù hợp để tiếp tục sửa.
- Đã tách evaluator khỏi WPI và bổ sung lý do theo tiêu chí. Đây là cấu trúc hữu ích khi hoàn thiện yêu cầu chứng cứ.
- Đã bổ sung public repository operations và Node tests; các luồng bảo toàn giá vốn nhập tay/watchlist khi rescan có kiểm tra.
- Đã chuyển nhiều thao tác giao diện sang event listeners và bổ sung kiểm tra source cho inline handlers.

Các điểm này cần được giữ và hoàn thiện hợp đồng hành vi. Không cần viết lại toàn bộ ứng dụng.

## 11 findings và hướng sửa

### R01 — P1: KC LOW tự thông qua readiness

- Điểm bắt đầu: `core/kcRules.js:106`; luồng gọi `core/winAlgorithm.js:489`.
- Quan sát: evaluateKcReadiness trả PASS khi không tìm thấy từ khóa rủi ro. Ca hồ sơ còn thiếu KC review đã trực tiếp nhận ready_for_trial trong review.
- Tác động: phân loại từ khóa được sử dụng như chứng cứ thẩm định. Đây là sai lệch với spec/ADR, không phải kết luận pháp lý về sản phẩm.
- Hướng sửa: tách risk signal và supporting review; thiếu source/reference, ngày và rationale phải unresolved kể cả LOW. Kiểm thử LOW, HIGH, title rỗng và dropdown thiếu evidence.

### R02 — P1: Các con số/checkbox chưa chứng minh hồ sơ đầy đủ

- Điểm bắt đầu: `core/winAlgorithm.js:263`, `:354`, `:468`, phần tổng hợp `:531`; form `ui/js/dashboard.js:578`.
- Tái hiện: peak 18,000 + seasonalityReviewed true, sample 60/18, seller reviews 50 nhưng international delivery false, supplier URL + price + isVerified. Thiếu metadata demand, quote terms, fulfillment và KC evidence nhưng cả 7 criterion hiện tại PASS, kết luận ready_for_trial.
- Tác động: app tuyên bố đã kiểm chứng điều mà hồ sơ không ghi nhận. UI không có đủ trường thì người dùng cũng không thể hoàn thành đúng hợp đồng.
- Hướng sửa: readiness dựa trên đủ trường, tính hợp lệ và quan hệ giữa bằng chứng với ứng viên. Thêm fulfillment criterion; kiểm tra seller identity/offer/international delivery; quote date/variant/quantity/MOQ; demand keyword/period/geography/source/units/finding. Hoàn thiện cả UI, save boundary và evaluator.
- Kiểm thử: tạo một dossier thực sự đầy đủ; bỏ từng trường/section bắt buộc; tất cả trường hợp thiếu phải pending. Kiểm tra count bất khả thi và missing-versus-zero costs riêng.

### R03 — P1: Giá quan sát và target cùng ghi đè nhau

- Điểm bắt đầu: `storage/storageRepository.js:290`, `:446`, `:667`.
- Tái hiện: quan sát 110,000 → save target 130,000: giá quan sát bị đổi 130,000 → rescan 90,000: target bị đổi 90,000.
- Tác động: dữ liệu thị trường mất ý nghĩa; lợi nhuận/eligibility thay đổi dù người vận hành không sửa baseline.
- Hướng sửa: xác định field ownership, tách command save economics và refresh observations; financial calculations lấy target. Kiểm thử lifecycle cả single và batch rồi reload.

### R04 — P1: Mutex chưa bao phủ toàn extension

- Điểm bắt đầu: `storage/storageRepository.js:49`; cách load repository trong các trang/content script và background.
- Tái hiện: hai context độc lập cùng đọc collection, một context sửa cost 222, context kia sửa ads 888. Hai lời gọi thành công nhưng trạng thái cuối là cost 100, ads 888; sửa cost đã mất.
- Tác động: một Promise queue trong mỗi module instance không điều phối được dashboard, side panel và nhiều tab.
- Hướng sửa: một writer trong service worker; mọi mutation đi qua public facade đến cùng authority. Đọc snapshot mới nhất bên trong operation, validate và commit trước acknowledgement; broadcast sau commit.
- Kiểm thử: hai client/module context và adapter clone snapshot, rồi kiểm tra lại từ storage; thêm installed-extension hai-page interaction. Hai Promise từ cùng singleton không chứng minh cross-context safety.

### R05 — P1: Restore đang dùng chính sách của rescan

- Điểm bắt đầu: `storage/storageRepository.js:848`.
- Tái hiện: export cost 150 → sửa existing cost 999 → import cùng backup → cost vẫn 999.
- Tác động: backup không thể khôi phục các user fields đã bị sửa sai của sản phẩm tồn tại. Test restore vào collection rỗng bỏ sót nhánh này.
- Hướng sửa: restore có command/semantics riêng, thay các backed-up user fields của matching product; validate toàn file trước commit; giữ unrelated records và recompute derived results. Không âm thầm bỏ qua invalid records.
- Kiểm thử: empty restore, existing-record restore, grouping/watchlist/evidence, repeated restore, malformed metadata và failed write của product/category commit.

### R06 — P1: Manual price kế thừa xác minh cũ

- Điểm bắt đầu: `storage/storageRepository.js:564` và criterion sourcing trong evaluator.
- Tái hiện: quote đã verified → updateProductCogs thành 999 → provenance MANUAL nhưng isVerified vẫn true, sourcing criterion vẫn PASS.
- Tác động: xác nhận cho quote cũ được áp vào giá mới không có chứng cứ.
- Hướng sửa: verification gắn với toàn bộ quote terms. Ordinary edit invalidates confirmation; explicit re-verification phải kiểm tra complete new quote và commit cùng terms. Rescan market không invalidates quote còn phù hợp.

### R07 — P2: Listing position bị nâng thành verified BSR

- Điểm bắt đầu: `storage/storageRepository.js:190`, `:331`, `:368`.
- Tái hiện: ordinary listing position 1 và rank null → save/read → rank 1, demandKnown true, WPI có thể thành 100.
- Tác động: đã bỏ fake rank ở extractor nhưng repository/migration đưa sự suy đoán trở lại downstream.
- Hướng sửa: phân biệt listingPosition và observed verified BSR xuyên suốt extractor → migration → save → enrichment → view. Chỉ sửa extractor là chưa hoàn thành yêu cầu unknown-data.
- Kiểm thử: public saved lifecycle, không chỉ assert raw extraction. Nếu thiếu component, UI không hiện numeric WPI như điểm đầy đủ.

### R08 — P2: Simulator chưa round-trip đầy đủ baseline

- Điểm bắt đầu: `ui/js/dashboard.js:774`, `:817`.
- Quan sát tĩnh: openSimulatorForProduct không nạp exchange/return/cash-flow inputs; giá trị mặc định hoặc previous scenario có thể còn lại. Checkbox CGF dùng cả Rocket Growth của đối thủ. Save baseline chỉ lưu một phần controls và tách economics/COGS thành hai lần ghi.
- Tác động: mở sản phẩm đã cho financial scenario khác baseline; save có thể ghi nhầm assumptions hoặc lưu một phần. Giá trị zero bị thay thế ở các fallback dùng truthiness.
- Hướng sửa: full initialize từ selected product, dùng fulfillment của người vận hành, retain mọi non-editable saved cost, temporary edits isolated; explicit save một logical operation cho all supported assumptions.
- Kiểm thử: A/B có assumptions khác nhau, returns/COGS/shipping zero khi hợp lệ, BUYING_PER_ORDER với competitor Rocket, save/reload order volume và settlement days. UI checks phải assert values/results, không chỉ modal mở.

### R09 — P2: Widget tính từ raw DOM thay vì saved dossier

- Điểm bắt đầu: `content/inpage_badge.js:25–29`; luồng update notification.
- Quan sát tĩnh: widget gọi enrichProduct(rawProd) và không resolve saved dossier. Raw extraction thiếu economics/evidence của operator; không có refresh đầy đủ khi dashboard cập nhật hồ sơ.
- Tác động: cùng product identity có thể có kết luận khác dashboard/side panel.
- Hướng sửa: resolve saved product qua public interface, render canonical assessment và refresh sau commit. Unsaved products là provisional. Fresh observations không được làm mất user baseline.
- Kiểm thử: deterministic detail fixture của saved complete dossier; edit cost/evidence từ dashboard; đối chiếu widget/side panel/dashboard và reload.

### R10 — P2: Validator kiểm tra sai vị trí của effective inputs

- Điểm bắt đầu: `core/feeCalculator.js:60`, `:67`, `:146–149`; repository truyền params tại `storage/storageRepository.js:306`.
- Tái hiện: exchangeRateCnyKrw -190 và platformCommissionRate -1 trong params vẫn isValid true, isComplete true, margin 223.2%.
- Tác động: validation customConfig không bảo vệ contract mà repository thực sự gọi. Form validation không bảo vệ import/public save.
- Hướng sửa: normalize effective inputs rồi validate chung; áp cùng contract ở calculation/save/import. Kiểm tra cả fee rate, return amount, dimensions và field aliases; không dùng coercion để biến missing thành explicit zero.

### R11 — P2: Threshold dựa trên số đã làm tròn

- Điểm bắt đầu: `core/feeCalculator.js:216`; margin check `core/winAlgorithm.js:442`; Rocket share rounding `:315`.
- Tái hiện margin: revenue 100,000; COGS 19,000; platform 11,000; ship 3,000; ads 42,040; các cost còn lại zero. Profit 24,960 → margin thật 24.96% → rounded 25% → margin criterion PASS.
- Tác động: số dưới ngưỡng vẫn đạt. Rocket rounding trước comparison cũng có thể loại tỷ lệ thực dưới 70%.
- Hướng sửa: giữ precision cho decisions, round ở display. Kiểm thử 24.96/25 và counts 6,996/10,000 so với 70/100.

## Nhận xét về cách triển khai cần cải thiện

### 1. Hoàn thiện hành vi xuyên suốt từng luồng

Hiện nhiều khái niệm đã có tên/trường/hàm, nhưng chưa được giữ qua toàn lifecycle. Ví dụ rank null ở extractor trở thành BSR ở repository; target/economics riêng ở schema vẫn bị rescan ghi đè. Với mỗi requirement, lần theo input → validation → save → read → assessment → render → rescan/restore trước khi đóng việc.

### 2. Viết rõ ai sở hữu từng nhóm dữ liệu

Observed market thuộc scan; economics/sourcing/evidence/watchlist thuộc operator; derived results thuộc calculator/evaluator. Generic merge đang trộn scan với restore và trộn target với observed price. Tạo command contracts theo ý định người dùng và các invariants bảo toàn tương ứng.

### 3. Hiểu phạm vi đồng bộ của nền tảng

Một local queue đủ cho một singleton Node test nhưng không đủ cho nhiều Chrome contexts. Thiết kế concurrency theo nơi dữ liệu được chia sẻ thực tế. Mô phỏng independent clients với snapshot isolation, rồi xác nhận cùng hành vi trong extension thật. Không gọi cơ chế hiện tại “atomic” nếu public operations vẫn có thể mất updates.

### 4. Test cần bảo vệ spec thay vì xác nhận current implementation

Fixture “complete passing dossier” hiện thiếu source/date/variant/quantity/fulfillment evidence nhưng test vẫn đòi ready_for_trial. Nó làm sai lệch requirement bằng một expected value quá dễ. Xây fixture đầy đủ từ domain requirements; sau đó bỏ từng chứng cứ, sửa từng boundary, kiểm tra mọi path công khai có cùng kết quả.

Test backup chỉ restore vào collection rỗng; test concurrency chỉ gọi cùng module; test extraction không bảo vệ saved BSR; test CSP regex không xác nhận thao tác user thành công. Bổ sung đúng ca còn thiếu, không cần tăng số lượng test chỉ để tăng coverage.

### 5. Một schema/input contract cho mọi caller

params và customConfig hiện có validation khác nhau, trong khi view/repository truyền qua cả hai. Chuẩn hóa effective inputs trước validation; định nghĩa null, blank, zero, estimated và verified một cách nhất quán. Các compatibility aliases phải có precedence rõ ràng.

### 6. Verification là một quan hệ với dữ liệu cụ thể

Không để isVerified tồn tại độc lập với quote terms. Khi terms đổi, confirmation phải hết hiệu lực. Tương tự, checkbox seasonality và status KC cần gắn supporting evidence; lời giải thích của app chỉ được mô tả điều hồ sơ thực sự chứng minh.

### 7. View chỉ chọn scenario và trình bày cùng mô hình

Widget không tính lại một saved product từ thiếu inputs; simulator không tự nạp defaults trái baseline; fulfillment không suy từ competitor. Baseline/scenario cần có vòng load → edit → explicit save → reload kiểm tra được. So sánh số tiền và trạng thái giữa views, không chỉ UI markup.

### 8. Báo cáo completion theo acceptance evidence

Issue 05/08 và spec gốc đã được đánh dấu closed/completed với các checkbox toàn bộ đạt, nhưng review vẫn tái hiện failures. Lần bàn giao tiếp theo cần liệt kê requirement → check → expected → actual và các gate chưa chạy. Có 19 test pass là bằng chứng cho 19 ca đó, không chứng minh tất cả stories đã hoàn tất.

Repo có exploratory audit reports và screenshots; kiểm tra applicability và chạy lại khi dùng chúng. Phân biệt clearly: directly reproduced, static-flow finding, historical artifact, current installed-extension result. Không suy rằng tất cả browser checks chưa từng được thực hiện chỉ vì Node suite không có chúng.

## Quy trình bàn giao đề nghị

1. Ghi lại trạng thái Git/baseline khả dụng và đọc original spec, glossary, ADR cùng corrective spec.
2. Thêm regression cho các lỗi đã tái hiện; chứng minh ca sai trước khi sửa. Dùng expected result theo contract, không sửa expectation để hợp với bug.
3. Sửa ownership và mutation authority trước các integration fixes để tránh nhiều nơi cùng tiếp tục ghi sai.
4. Hoàn thiện evidence validation/UI, verification lifetime và financial precision; kiểm tra mỗi requirement qua public saved lifecycle.
5. Hoàn thiện simulator/widget, chạy installed-extension interaction checks trên temporary profile và deterministic fixtures.
6. Bàn giao bảng R01–R11 gồm expected, actual, check/command, current revision và pass/fail/blocked/not-run. Nêu migration behavior và remaining limitations.
7. Chỉ đánh dấu hoàn tất khi các acceptance gates liên quan đạt; không tự thay đổi requirements để đóng việc.

## Prompt có thể đưa nguyên văn cho Antigravity

> Hãy implement `.scratch/product-evaluation-trust-remediation/spec.md`. Đọc `.scratch/product-evaluation-trust-remediation/implementation-feedback.md`, spec gốc, GLOSSARY.md và ADR trước khi sửa. Đây là remediation cho các sai lệch với yêu cầu đã chốt. Trước tiên bổ sung regression cho R01–R11 và xác nhận các ca sai; giữ expected behavior theo spec. Ưu tiên data ownership, một writer xuyên Chrome contexts và semantics restore, rồi hoàn thiện evidence/verification, shared finance và views. Dùng public storage lifecycle và extension Chrome thật để nghiệm thu; không coi test singleton, fixture thiếu evidence, source regex hoặc modal mở là đủ. Bàn giao bảng R01–R11 có kết quả kiểm chứng hiện tại, các gate chưa chạy và limitations. Không đánh dấu completed khi còn acceptance failure hoặc gate bắt buộc chưa được xác nhận.
