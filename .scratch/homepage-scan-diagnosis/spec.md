# Chẩn đoán nút nạp Coupang trả về không có sản phẩm

Ngày kiểm tra: 2026-10-12. Phạm vi: chỉ kiểm tra theo yêu cầu người dùng; không sửa mã extension, không dùng hồ sơ Chrome hoặc dữ liệu thật của người dùng.

## Kết luận

1. URL người dùng cung cấp `https://www.coupang.com/` là trang chủ. Trong phiên quan sát, trang có banner chiến dịch/cửa hàng, 0 liên kết `/vp/products/`, 0 thẻ khớp selector của extractor. Nút nạp vẫn xuất hiện vì `initFloatingWidgets` gọi `renderListingPageBar` trên mọi trang không phải chi tiết sản phẩm. Nút không phân biệt trang chủ, danh sách được hỗ trợ, hoặc trang chưa tải sản phẩm.
2. Trang tìm kiếm thật với từ khóa `수납함` có 112 liên kết sản phẩm nhưng 0 thẻ khớp selector hiện tại. Extractor phụ thuộc cấu trúc cũ ở cả bốn điểm: container, mã sản phẩm, tên, giá. Chỉ thay selector container sẽ chưa đủ.
3. Đường nạp vào storage hoạt động trong đối chứng: cùng extension MV3 được cài trong Chrome, cùng nút, danh sách cấu trúc cũ lưu thành công 1 sản phẩm. Ở các replay lỗi, extractor trả về rỗng trước khi gọi `batchImportProducts`. Chưa có bằng chứng lỗi lưu trữ gây triệu chứng này.

## Bằng chứng DOM trực tiếp

Quan sát qua trình duyệt trên trang Coupang thật, không suy luận từ fixture:

| Trường | Extractor hiện tại | Thẻ tìm kiếm quan sát được |
|---|---|---|
| Container | `li.search-product`, `li.baby-product`, `.search-product-list li` | `li.ProductUnit_productUnit__Qd6sv` |
| Mã | `data-product-id` hoặc chữ số trong `id` | Product ID `9693648728` nằm trong href `/vp/products/9693648728`; `data-id="95921999183"` là vendorItemId |
| Tên | `.name`, `.title`, `.prod-title` | `.ProductUnit_productNameV2__cV9cw` |
| Giá bán | `.price-value`, `.total-price strong`, `.prod-price strong` | Span `195,800원` trong `PriceArea_priceArea__NntJz`, có lớp utility ở phần giá bán |

Thẻ có cả giá gạch `219,800원`, tỷ lệ giảm `10%`, giá bán và đơn giá. Cần phân biệt các số này nếu sửa bộ quét. DOM quan sát của trang tìm kiếm không chứng minh các trang BSR khác dùng cùng cấu trúc.

## Vòng tái hiện

Chạy tại gốc repository:

```powershell
node .scratch/homepage-scan-diagnosis/repro.cjs --expect-import
```

Exit 1, hai lần đều có nút, alert `Không tìm thấy danh sách sản phẩm trên trang này!`, storage 0. Fixture là một banner trang chủ đã tối giản từ DOM thật, bỏ tham số tracking và trang trí.

```powershell
node .scratch/homepage-scan-diagnosis/repro.cjs --expect-modern-import
```

Exit 1: đối chứng danh sách cũ lưu 1 sản phẩm; replay một thẻ tìm kiếm thật hiển thị 1 liên kết sản phẩm nhưng extractor không nhận diện, alert giống trên, storage vẫn chỉ có sản phẩm đối chứng.

```powershell
node .scratch/homepage-scan-diagnosis/repro.cjs --probes
```

Exit 0 của phép kiểm tra chẩn đoán, không có nghĩa bug đã sửa. Các probe chỉ đổi fixture, mỗi bước thêm một tương thích với DOM cũ:

| Bước tích lũy | Kết quả trích xuất |
|---|---|
| Thêm class container cũ | 0 |
| Thêm data-product-id đúng | 0 |
| Thêm class tên cũ | 0 |
| Thêm class giá bán cũ | 1; productId 9693648728; salesPriceKrw 195800; rank null |

Kết quả máy đọc được nằm trong `result.json`. Profile thử nghiệm được tạo riêng trong thư mục này và xóa sau khi Chrome đóng. Không có log debug thêm vào production.

## Vị trí liên quan

- `content/coupang_extractor.js:18–33`: selector và điều kiện bỏ qua sản phẩm.
- `content/inpage_badge.js:8–15`: hiện thanh nạp cho mọi trang không phải detail.
- `content/inpage_badge.js:177–182`: báo rỗng và thoát trước khi lưu.
- `ui/js/sidepanel.js:221–245`: nút quét sidepanel cũng dùng extractor này và báo lỗi khi kết quả rỗng.

## Hướng xử lý sau kiểm tra

- Hỗ trợ cấu trúc ProductUnit hiện tại ở container, ID từ product URL, tên và giá bán; giữ hỗ trợ cấu trúc cũ.
- Không lấy `data-id` trên thẻ này làm productId; đó là vendorItemId.
- Trang chủ cần hướng dẫn mở trang danh sách/sản phẩm; không gọi banner là sản phẩm hoặc BSR.
- Giữ rank null trên kết quả tìm kiếm thông thường.
- Khóa hành vi bằng regression tại nút nạp, storage và DOM replay trước khi triển khai sửa.

Không thực hiện pha sửa và chạy xanh của skill diagnosing-bugs vì người dùng yêu cầu chỉ kiểm tra. Hai vòng kỳ vọng nạp ở trên vẫn đỏ có chủ đích và ghi lại lỗi đang tồn tại.
