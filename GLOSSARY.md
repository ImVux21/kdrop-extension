# Domain Glossary (K-Drop Studio)

## 1. Provenance Categories (Nguồn gốc dữ liệu)
- **OBSERVED**: Dữ liệu bóc tách trực tiếp từ Coupang DOM hoặc API phản hồi thực tế (ví dụ: giá bán Coupang, ảnh thumbnail, tên sản phẩm). Không suy đoán.
- **HEURISTIC**: Dữ liệu ước tính theo thuật toán hoặc quy tắc gợi ý sơ bộ (ví dụ: giá vốn 1688 tạm tính từ giá bán Coupang).
- **MANUAL**: Dữ liệu do người vận hành nhập tay trực tiếp (ví dụ: chi phí tùy chỉnh, ghi chú).
- **EVIDENCE**: Dữ liệu được hỗ trợ bởi bằng chứng xác thực (ví dụ: báo giá xưởng đính kèm link/ngày/quy cách, ảnh chụp kiểm tra Rocket, số liệu tìm kiếm từ khóa có nguồn).
- **LEGACY**: Dữ liệu từ các phiên bản trước khi có hệ thống provenance, chưa được kiểm chứng nguồn gốc.

## 2. Trial Selling Eligibility (Đánh giá điều kiện thử bán)
- **ready_for_trial** (*Đủ điều kiện thử bán*): Hồ sơ đã hoàn tất toàn bộ bằng chứng bắt buộc, vượt qua tất cả các tiêu chí loại trừ, giải trình đầy đủ giá (nếu trong khoảng 50k-100k KRW) và biên lợi nhuận ròng sau chi phí vận hành đạt tối thiểu 25%.
- **needs_verification** (*Cần xác minh*): Hồ sơ còn thiếu bằng chứng hoặc còn điều kiện chưa được kiểm chứng (ví dụ: chưa kiểm tra từ khóa rủi ro KC, chưa có báo giá khớp quy cách, chưa ghi nhận dung lượng tìm kiếm), nhưng chưa có điều kiện nào xác nhận thất bại.
- **not_eligible** (*Chưa đạt điều kiện*): Hồ sơ có ít nhất một điều kiện xác nhận vi phạm/thất bại (ví dụ: sản phẩm lỗ, biên lợi nhuận < 25%, giá bán < 50k KRW, thị phần đối thủ Rocket >= 70%, từ khóa rủi ro KC không thể xin miễn trừ). Điểm WPI cao không thể đảo ngược trạng thái này.

## 3. Screening Score (Điểm ưu tiên sàng lọc - WPI)
- **Winning Product Index (WPI)**: Điểm sàng lọc theo trọng số (Lợi nhuận 35%, Cơ hội Buy Box 25%, An toàn KC 15%, Tính khả thi giá 15%, Nhu cầu BSR 10%).
- **Provisional WPI** (*Điểm tạm tính*): WPI được tính toán khi các tham số tài chính hoặc thị trường là ước tính (HEURISTIC) hoặc chưa đủ bằng chứng.
- **Tiers**: Diamond (>=85), Gold (>=70), Silver (>=55), High Risk (<55). Xếp hạng này chỉ mang tính sàng lọc ưu tiên nghiên cứu, không thay thế cho kết luận thử bán.

## 4. Research Profile Criteria (Tiêu chí nghiên cứu ngách)
- **Demand Criterion**: Dung lượng tìm kiếm tháng đỉnh điểm năm trước (peak monthly absolute searches) >= 10,000 lượt và có đánh giá tính mùa vụ (seasonality). Chỉ số xu hướng chuẩn hóa không thay thế số tìm kiếm tuyệt đối.
- **Rocket Competition Criterion**: Tỷ lệ sản phẩm Rocket Delivery / Growth trong mẫu kiểm tra có liên quan < 70%.
- **Seller Review Criterion**: Số lượng review dành riêng cho nhà bán giao hàng quốc tế (seller-specific reviews) >= 30 review. Số review sản phẩm thông thường không thỏa mãn tiêu chí này.
- **Price Criterion**: Giá bán mục tiêu >= 100,000 KRW là tối ưu; từ 50,000 đến dưới 100,000 KRW yêu cầu giải trình kinh tế (documented review); dưới 50,000 KRW không đạt.
- **Margin Criterion**: Biên lợi nhuận sau toàn bộ chi phí vận hành (hàng, ship, sàn, mua hộ, quảng cáo, dự phòng hoàn hủy) >= 25%.

## 5. Dossier & Economics (Hồ sơ chứng cứ & Tài chính)
- **Sourcing Dossier**: Báo giá xưởng gồm URL xưởng, ngày báo giá, quy cách/phân loại, đơn giá CNY, số lượng báo, MOQ, và xác nhận của người vận hành.
- **Baseline vs Scenario**: Baseline là các tham số tài chính chính thức đã lưu của sản phẩm. Scenario là các giả định thử nghiệm tạm thời trong Simulator (Thuận lợi / Cơ sở / Bất lợi).
