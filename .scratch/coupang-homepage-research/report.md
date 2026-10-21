# Trang chủ Coupang, best sellers và sales volume

Ngày kiểm tra: 2026-10-12. Phạm vi: nghiên cứu và đối chiếu bộ cào hiện tại; không sửa production code.

## Kết luận

Trang chủ cào được. Phiên người dùng đang mở có thẻ sản phẩm thật, bên cạnh banner, quảng cáo cá nhân hóa và khối khuyến mại. Không được suy ra vị trí homepage là BSR. Nhận định trước đây “homepage chỉ có banner” chỉ phản ánh một lần quan sát khi các module chưa xuất hiện, không phải quy tắc của Coupang.

## Bằng chứng DOM live

Nguồn: tab có sẵn tại https://www.coupang.com/, đọc DOM bằng CUA. Chi tiết [dom-observations.json](dom-observations.json).

DOM có 581 liên kết `/vp/products/`, 535 productId khác nhau. Đây là số tham chiếu DOM, có carousel ẩn/trùng, không phải số thẻ nhìn thấy hay dung lượng thị trường. Nội dung có thể đổi theo phiên, thời điểm và cá nhân hóa.

| Module quan sát | Ý nghĩa được chứng minh | Hướng lưu dữ liệu |
|---|---|---|
| 이 상품 놓치지 마세요 + 광고 | HOME_PERSONALIZED_ADS | Quảng cáo cá nhân hóa |
| 지금 이 상품이 필요하신가요? + 광고 | HOME_RELATED_ADS | Quảng cáo liên quan |
| 좋아할만한 카테고리 상품 + 광고 | HOME_TRENDING_ADS | Quảng cáo trong nhóm được đề xuất |
| 카테고리별 추천 광고상품 | `categoryBestUnit`, nhiều link `sourceType=srp_product_ads` | Quảng cáo theo danh mục; tên kỹ thuật Best/ranking không chứng minh sales rank |
| 오늘의 판매자 특가 | HOME_GW_PROMOTION | Khuyến mại nhà bán; chưa chứng minh vị trí trả phí hay thứ tự bán chạy |
| 로켓직구 글로벌특가 | HOME_JIKGU_PROMOTION | Khuyến mại mua hàng quốc tế; chưa chứng minh thứ tự bán chạy |
| 오늘의 발견 | Liên kết shop/campaign trong lần quan sát | Tách banner/landing page khỏi thẻ sản phẩm |

Card category mẫu có tên `.name`, giá `.price.price-v2 strong` 29.900 KRW, ảnh, productId/itemId/vendorItemId và badge ROCKET_MERCHANT/TOMORROW. Có đủ trường cơ bản để cào. Card personalized mẫu có ảnh/tên/rating/reviews nhưng chỉ hiển thị giảm 59%, không có giá bán. Phải để thiếu giá hoặc bổ sung từ PDP, không dùng phần trăm giảm làm giá.

Một card personalized có `data-index=0` trong DOM nhưng click-logging `rank=4`. Các số này là ngữ cảnh trình bày/logging, không có bằng chứng là thứ hạng lượng bán. URL `from=home_CategoryBest_ranking` cũng không đủ chứng minh BSR.

## Đối chiếu extension

Selector thực tế trong `content/coupang_extractor.js` (li.search-product, ProductUnit/productUnit, product-list/productList...) được đối chiếu nguyên danh sách trên DOM homepage: khớp **0 phần tử**, dù có 581 link sản phẩm. Homepage dùng anchor `.product-unit.category-best-link` và card personalized với cấu trúc khác. Đây là bằng chứng lỗi nhận diện thẻ, không phải homepage không có sản phẩm.

`scanCurrentPage()` trả SUCCESS nếu cào được sản phẩm. Nhưng khi không lấy được sản phẩm trên homepage, nhánh HOMEPAGE hiện trả “Trang chủ Coupang chỉ chứa banner quảng cáo...” và bỏ qua sự khác biệt giữa loading, thiếu trường và selector chưa hỗ trợ. Phạm vi fix tiếp theo nên hỗ trợ các module có card, phản ánh lý do bỏ qua, và thay thông báo tuyệt đối này.

Chưa bấm hai nút của extension trong lần nghiên cứu này; selector được đối chiếu read-only. Kết quả gate/replay trước ở `.scratch/coupang-scan-fix/verification/` không chứng minh homepage live đã hoạt động.

## Cơ chế hiển thị: đã biết và chưa biết

DOM chứa Next.js flight payload `self.__next_f.push`, module route `app/gw/page-0c3b5053b7332310.js`, prop `bestCategoryLazyLoading=true` và danh sách initialCategories. Các card có ID cấp product/item/vendor, sourceType và dữ liệu logging. Đây là chứng cứ client rendering và cấu hình lazy-loading; chưa xác minh endpoint trả product feed hoặc công thức server chọn/xếp hạng.

[Coupang Ads FAQ](https://ads.coupang.com/Faq.html) xác nhận quảng cáo homepage dựa dữ liệu cá nhân hóa và recommendation algorithm. Không thể suy ra seller lời hay hàng bán nhiều từ việc được quảng cáo. Không có cơ sở để khẳng định thuật toán chỉ dùng sales, hoặc gán trọng số cụ thể.

REA 6.3.0 đã chạy Chrome riêng, profile tạm rỗng, locale ko-KR:

- Homepage: HTTP 403 Access Denied. Evidence `ev_8028767b5992e474924d7e5ceb62f7eba06cc5a785446e7d22a7f254d9598b1a`, [capture đầy đủ](rea-homepage-capture.json).
- Bundle GW được tham chiếu trong DOM: HTTP 403. Evidence `ev_3ef955c8b9ed35c4da6794caba35ec20ca5ee480f607e3c9797df1c95ae310c4`, [capture đầy đủ](rea-bundle-capture.json).
- REA đã đóng browser do provider sở hữu. Không thay đổi cookie/profile người dùng. Không vượt qua kiểm soát truy cập.
- IAB cung cấp DOM nhưng không cung cấp CDP endpoint trong API hiện có; không gắn REA vào tab đó được. Vì vậy chưa có capture feed live hoặc bundle code để chứng minh thuật toán. Việc tool báo capture complete chỉ có nghĩa capture 403 đầy đủ, không có nghĩa nghiên cứu cơ chế hoàn tất.

## Best sellers và volumes

1. **Category/search → 판매량순**: [category mẫu](https://www.coupang.com/np/categories/519951) có radio thực tế `sorter-SALES_COUNT`, value `saleCountDesc`. Khác default 쿠팡 랭킹순 (`bestAsc`), vốn trang giải thích là tổng hợp hiệu suất bán, sở thích người dùng, thông tin sản phẩm và độ chính xác tìm kiếm. Category mẫu đang báo không có sản phẩm; thao tác chọn radio/label không đổi state hoặc URL, nên chưa xác minh kết quả đã được sắp theo lượng bán. Không công bố URL sort dựng từ suy đoán. Period và cách loại ads trong sales order còn chưa rõ.
2. **PDP monthly purchaser badge**: [PDP mẫu](https://www.coupang.com/vp/products/5532336625?categoryId=393660&itemId=8685540289&sourceType=CATEGORY&vendorItemId=75972634868) live hiển thị `한 달간 2만명 이상 구매했어요`: ít nhất 20.000 người mua trong một tháng. Không phải exact units, số đơn hoặc doanh thu. Lưu raw text, lower bound, unit people, time wording, IDs của option, URL và thời điểm. Các option khác và snapshot khác có thể có badge khác; chưa xác minh phương pháp đếm/phạm vi gộp.
3. **BEST AWARDS**: [thông báo chính thức](https://news.coupang.com/archives/54597/?print=pdf) mô tả chương trình theo kỳ dựa dữ liệu mua, doanh thu, lượng bán và reviews. Phân biệt 베스트 셀링 với 리뷰 베스트. Lưu loại award, category, kỳ dữ liệu và tiêu chí; không coi mọi award là current sales rank.
4. **WING Business Insights**: [guide chính thức](https://marketplace.coupang.com/information-center/marketplace3p-business-insights) có Top 50 competitor products/search terms, dữ liệu category tới 360 ngày, impressions/CTR/conversion và luồng organic/ads. Dành cho seller có subscription; chưa đọc account WING hay xác minh trường exact competitor units.
5. **Số lượng của shop mình**: [API ordersheets](https://developers.coupang.com/ko/api/shipments/po-list-query-paging-by-day) có quantity và trường hủy theo vendorId được xác thực. Không phải public API cho doanh số đối thủ.

Chưa tìm được trang global BSR hoặc API public exact units của mọi đối thủ trong nguồn chính thức đã kiểm tra. Đây là giới hạn tìm kiếm, không chứng minh chúng không tồn tại.

## File Antigravity

Đã đọc chỉ đọc file người dùng cung cấp: SQLite 260 steps, payload protobuf, nghiên cứu Coupang Android APK 9.4.5. Có class BestRankingListCarousel/BestRankingPagerCarousel và chuỗi endpoint/sort constants, nhưng không có capture web homepage, response sales-volume live hoặc công thức ranking đã kiểm chứng. Claims giảm trọng số shipping 80%/hết hàng bị loại vĩnh viễn vượt quá strings đã ghi nhận. [Đối chiếu chi tiết](antigravity-context.md).

## Áp dụng cho tìm ứng viên

Cào homepage để thu ứng viên, lưu section/sourceType/ad disclosure/IDs/giá/rating/reviews/thời điểm. Giữ vị trí module riêng với BSR; không đặt cờ bestseller vì pathname homepage hay tên component có Best. Đối chiếu ứng viên bằng sales order theo ngách, monthly purchasers, awards đúng loại/kỳ và seller insights. Ưu tiên ứng viên có nhiều nguồn nhu cầu độc lập và theo dõi biến động theo thời gian.

Trong domain hiện tại, dữ liệu cào là OBSERVED. Homepage exposure không đủ cho ready_for_trial: vẫn cần kiểm tra báo giá, chi phí, margin, cạnh tranh Rocket và tiêu chí hồ sơ. Monthly purchasers cũng không thay thế tiêu chí absolute keyword-search volume trong GLOSSARY.

## Checklist

- Homepage ads hay bestseller: đã trả lời cho các module đang quan sát; không khái quát mọi phiên.
- Có thể cào homepage: đã chứng minh card đủ trường tồn tại, xác định selector hiện tại bỏ sót.
- Cơ chế client: trả lời một phần bằng DOM/props/logging; server algorithm và feed endpoint chưa xác minh do 403/CDP gap.
- Best sellers/volumes: tìm được public sales-sort control, purchaser badge, awards và seller data sources; exact competitor units/global BSR chưa xác minh.
- Antigravity context: đã đối chiếu artifact Android với web, tách strings khỏi hành vi runtime.

Nguồn bổ sung và giới hạn snapshot: [official-sources.md](official-sources.md).
