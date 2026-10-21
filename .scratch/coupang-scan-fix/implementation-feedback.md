# Verify bản sửa Coupang scan — 2026-10-12

Verdict: **Các lỗi nạp homepage và F01–F04 đã được sửa; toàn bộ replay gate hiện qua.** Trang chủ được xác minh bằng fixture replay trong installed Chrome, chưa xác minh bằng truy cập live mới.

## Retest sau sửa — 2026-10-12

| Lệnh | Kết quả | Giới hạn |
|---|---|---|
| `node --test tests/*.test.js` | 51 pass, 0 fail | Unit tests |
| `node .scratch/coupang-scan-fix/verification/run-gate.cjs` | 38 pass, 0 fail | Chrome MV3, profile cô lập; gồm nút nổi, sidepanel, homepage card, banner-only, Studio và reload |
| `node .scratch/coupang-scan-fix/verification/edge-gate.cjs` | 56 pass, 0 fail | Chrome MV3; hai entry points, edge cases, lỗi storage, BSR rescan và thumbnail |

Trang chủ nạp được card category có giá qua cả hai nút; productId/vendorItemId, giá 29,900 KRW, section và source quảng cáo được giữ đúng. Banner-only không tạo record. Giá mơ hồ và chỉ có phí ship bị bỏ qua; rank không xác minh vẫn null sau quét lại; srcset lưu một URL ảnh hợp lệ. Không có capture BSR thật nên extractor tiếp tục để rank unknown.

## Kết quả chạy lại

| Lệnh | Kết quả | Giới hạn |
|---|---|---|
| `node --test tests/*.test.js` | 49 pass, 0 fail | Bao gồm mock DOM; không thay thế Chrome gate |
| `node tests/installed_chrome_gate.cjs` | 11 pass, 0 fail | Gate hồi quy hiện có |
| `node tests/installed_coupang_gate.cjs` | 29 check pass trước khi dừng bởi DNS của example.com | Lỗi phụ thuộc mạng của harness, không phải bằng chứng bug production |
| `node .scratch/coupang-scan-fix/verification/run-gate.cjs` | 32 pass, 0 fail | Chạy lại gate trên với example.com được replay thành một trang ngoài Coupang và abort thumbnail ngoài mạng; giữ nguyên implementation |
| `node .scratch/coupang-scan-fix/verification/edge-gate.cjs` | **47 pass, 9 fail; exit 1** | Gate độc lập, fixture có điều khiển, Chrome cài extension thật, hai entry point, storage thật |

Gate độc lập xác nhận cả nút nổi và sidepanel nạp modern card đúng Product ID 9693648728, vendorItemId 95921999183, giá 195800, rating 5, reviews 2, rank null. Kiểm tra trực tiếp nội dung bảng Studio sau commit và sau reload đều pass. Legacy listing, guidance trang chủ, thẻ thiếu giá, DOM tải muộn, ngữ cảnh extractor thiếu và lỗi storage được fault-inject đều có kết quả đúng ở cả hai nút.

Replay và fault injection chỉ dùng profile thử nghiệm được cô lập. Fault injection chỉ gây lỗi commit tại ranh giới lưu trữ; không thay extractor, handler nút hoặc kết quả kỳ vọng bằng mock. Không dùng profile Chrome hay dữ liệu người dùng.

## F01 — [P2] Giá không rõ ràng hoặc chỉ có phí ship vẫn được nhập thành giá bán

Điểm liên quan: `extractCardSalesPrice`, đoạn chọn candidate đầu tiên trong Coupang extractor.

Hai ca replay ở cả nút nổi và sidepanel:

- Khu vực giá có hai span `10,000원` và `20,000원`, không có role/markup xác định giá bán: vẫn báo nạp thành công và lưu `salesPriceKrw = 10000`. Spec yêu cầu bỏ qua khi không xác định được giá bán duy nhất.
- Thẻ có tên và Product ID hợp lệ nhưng PriceArea chỉ có span `shipping-cost` ghi `3,000원`: vẫn nạp thành công và lưu `salesPriceKrw = 3000`. Không có giá hàng trong input này.

Nguyên nhân: loại trừ dựa vào một số từ trong text và thẻ gạch/đơn giá, sau đó lấy số đầu tiên có ký hiệu won. Không chứng minh candidate đó là giá bán; class phí ship không được xét. Một lần import thành công vì vậy có thể làm sai dữ liệu thị trường và assessment.

Yêu cầu sửa: xác định role giá bán tại từng layout được hỗ trợ, bỏ qua khi thiếu/không rõ giá, và khóa hai ca trên bằng regression qua cả hai nút. Có **4 assertion fail** thuộc nhóm này.

## F02 — [P2] URL ngoài Coupang vẫn được nhận là sản phẩm Coupang

Điểm liên quan: phân tích `fullUrl` và `matchProdUrl` trong Coupang extractor.

Thẻ ProductUnit đặt trên trang Coupang có link `https://example.com/vp/products/123456789`, tên và giá hợp lệ. Cả hai nút vẫn báo nạp thành công, lưu Product ID 123456789 và giữ nguyên URL ngoài Coupang trong `marketData.productUrl`.

Nguyên nhân: regex nhận đoạn `/vp/products/` trong chuỗi URL mà chưa xác thực protocol, hostname và pathname sản phẩm. Đây là thẻ thử nghiệm có điều khiển để kiểm tra hợp đồng URL, không phải tuyên bố đã thấy link đó trên trang live.

Yêu cầu sửa: resolve URL trước rồi xác thực origin/path Coupang, không nhận product path nằm trong URL ngoài phạm vi hoặc query của campaign. Giữ phân biệt Product ID/vendorItemId và legacy hợp lệ. Có **2 assertion fail**.

## F03 — [P2] Rescan đưa rank chưa xác minh vào hồ sơ; rank còn lấy từ vị trí DOM

Điểm liên quan: tính `isVerifiedRankingPage`/`rank` trong extractor và `mergeScannedProduct` trong repository.

Hai replay có điều khiển trên đường dẫn best, có badge rank nhưng không có chứng cứ xác nhận bảng BSR thật:

- Thứ tự DOM gồm sản phẩm badge 1, quảng cáo, sản phẩm badge 2. Lần nạp đầu `marketData.rank` của sản phẩm cuối là null; quét lại lưu rank **3**.
- Một sản phẩm có badge **17**, ở vị trí đầu. Lần nạp đầu rank null; quét lại lưu rank **1**.

Nguyên nhân kết hợp:

- Extractor coi path + class generic là đủ để xác minh và gán `index + 1`, không đọc giá trị badge thực tế, không loại vị trí quảng cáo khỏi thứ hạng.
- Migrate của bản ghi mới chỉ nhận top-level rank khi có cờ `isBestSellerPage`; extractor không gửi cờ này nên bản ghi mới giữ null.
- Rescan merge lại ghi trực tiếp `scannedItem.rank` vào marketData, bỏ qua điều kiện xác minh của đường tạo mới. Vì vậy chỉ test lần nạp đầu sẽ bỏ sót lỗi.

Yêu cầu sửa: cùng một hợp đồng chứng cứ rank cho tạo mới và rescan. Layout chưa có capture chứng minh là BSR thì rank phải unknown. Nếu hỗ trợ BSR đã xác minh, đọc rank quan sát, không dùng vị trí raw DOM/ads làm rank. Có **2 assertion fail**. Các ca này chứng minh sai biệt lifecycle và phép gán rank; chúng không chứng minh support một trang BSR live cụ thể.

## F04 — [P2] Fallback srcset bị lưu nguyên chuỗi nhiều ảnh làm thumbnail URL

Điểm liên quan: chọn và chuẩn hóa thumbnail trong extractor.

Input có src placeholder và srcset gồm hai URL HTTPS với descriptor 1x/2x. Đã lưu:

`https://thumbnail.coupangcdn.com/item.jpg 1x, https://thumbnail.coupangcdn.com/item2.jpg 2x`

Đây không phải một URL ảnh. Logic hiện tại chỉ tách chuỗi chứa dấu phẩy khi chuỗi không bắt đầu bằng http, nên srcset thông thường bị lọt qua.

Yêu cầu sửa: parse candidate srcset thành một URL, bỏ descriptor và chuẩn hóa; không thay ảnh sản phẩm bằng badge. Có **1 assertion fail**.

## Bằng chứng và phạm vi

- Các input và lệnh runnable nằm trong thư mục verification cùng feature này.
- `edge-results.json` lưu expected/actual của 56 checks; `observations.json` lưu sản phẩm, giá, URL, rank và thông báo của các ca cần đối chiếu.
- Bản gate nguyên gốc được kiểm tra chỉ xác nhận một số hàng trong acceptance matrix. Một số assertion còn yếu: “Studio displays” đọc collection trong memory, ca late import có check expected=true/actual=true, và chưa có ca BSR rescan. Gate độc lập bổ sung assertion bảng Studio và các ca biên, không sửa gate tác giả.
- Lần kiểm tra live mới mở trang tìm kiếm Coupang nhận thông báo sử dụng trang bị hạn chế; không có DOM sản phẩm trong phiên đó. **Chưa xác nhận bản sửa trên trang live hiện tại.** Replay dựa vào DOM đã quan sát ở bước chẩn đoán và fixture có điều khiển được ghi rõ ở trên.
- Không capture được bảng BSR live; không có căn cứ để ghi “BSR đã verified”. Không bypass thông báo hạn chế, CAPTCHA hoặc access control.
- Double-click đồng thời và mọi biến thể danh mục/BSR không được chứng minh đầy đủ bởi báo cáo này. Không dùng kết quả 32/32 của gate tác giả để tuyên bố toàn bộ spec đạt 100%.

## Handoff

Ticket 01 được mở lại với ready-for-agent và feedback này. Sửa F01–F04, chạy lại gate độc lập để 9 assertion đỏ thành xanh, rồi kiểm tra live khi truy cập được. Hai luồng nạp modern card đã đúng cần được giữ nguyên cùng các gate 49/49, 32/32 và 11/11 đang pass.
