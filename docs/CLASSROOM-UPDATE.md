# Cập nhật hệ sinh thái — Classroom foundation

Ngày: 2026-11-21. Đây là đợt hoàn thiện luồng lớp học trên các thành phần hiện có, **không phải tuyên bố đã nâng cấp và kiểm thử toàn bộ hệ sinh thái**.

## Đã triển khai

| Thành phần | Cập nhật |
| --- | --- |
| CP Exam Server | Trang học sinh `/oj` và `/join`, mã phòng, phiên bắt buộc, đóng/mở phòng, từ chối POST khác origin, không CORS wildcard, thông báo lỗi bộ chấm |
| Dashboard | Mở bằng mã, liên kết học sinh điền sẵn mã, token quản trị trong header, CSV xác thực, làm mới mỗi 5 giây, hiển thị trạng thái phòng, thoát HTML ở tên và bảng điểm |
| Judge | Thiếu đáp án trả NO_OUT, không chấm AC với output rỗng; bộ test hồi quy có chấm C++/Python thực tế |
| CP Studio extension | Lệnh/nút dashboard và OJ, lưu phiên trong SecretStorage, HTTP/HTTPS đúng transport và port, timeout kết nối |
| Website | `classroom.html`: giới thiệu, hướng dẫn và form mở máy chủ do giáo viên cung cấp; liên kết từ trang chủ/Void-bit; sitemap |
| Launcher | Python CLI độc lập, doctor, chọn host/port, không mở LAN mặc định; wrapper Windows |
| Tài liệu & CI | README cập nhật, hướng dẫn LAN/bảo mật, workflow Classroom độc lập trên Linux/Windows, kiểm tra cú pháp JavaScript không cần npm |

## Đã kiểm tra cục bộ

- 9 test HTTP/regression: trang và mã phòng, payload, quyền admin và origin, chống mạo danh, đóng/mở phòng, NO_TESTS, C++ AC, Python AC/WA/CE/NO_OUT, 4 bài nộp song song, audit chain, chống công thức CSV.
- Kiểm tra cú pháp script dashboard, học sinh, website và CP extension bằng Node.
- Python compile, launcher doctor, `git diff --check`.

Test C++ tự bỏ qua khi không có compiler. Các test không lấy dữ liệu học sinh thật. Không kiểm thử giao diện bằng trình duyệt tự động, chưa kiểm thử máy Windows hoặc nhiều máy LAN trong môi trường này. Workflow Windows được thêm, chưa có kết quả chạy GitHub để xác nhận.

## Giới hạn và phần tiếp theo

1. **Void-bit**: checkout hiện chỉ có gitlink tại `products/void-bit`, không có `.gitmodules` hay mã nguồn. Không tự đoán repository nguồn, không thay gitlink, không tuyên bố đã sửa engine/UI Void-bit. Cần khôi phục nguồn đúng commit trước khi làm vòng tích hợp.
2. **Native Tauri / Dev Studio**: chưa thay đổi backend hoặc quyền Tauri, AI, compiler và build desktop. Các điểm mở Classroom hiện ở CP Studio; không giả định luồng desktop đã được kiểm chứng.
3. **Đề bài/test**: giáo viên đặt file vào `server/tests/MAPHONG/`; chưa có editor đề bài hay upload ZIP trên dashboard. Không có danh mục bài tập Void-bit trong Classroom.
4. **Phiên học sinh**: web giữ theo tab; chưa có reset phiên giáo viên, OAuth hoặc quản lý tài khoản. Token không thay thế giám sát phòng thi.
5. **Triển khai**: không public Internet. Linux subprocess không có sandbox cấp hệ điều hành; Windows isolation hiện có cũng cần audit riêng. Chưa bổ sung quota/rate-limit, worker cách ly hoặc database cho tải lớn.
6. **Website**: trang kết nối không chạy judge và không tự ping server LAN; dùng điều hướng để tránh mixed-content/CORS và không đoán localhost của thiết bị học sinh.
7. **Phát hành**: sửa source extension, chưa đóng gói lại `.vsix`, build desktop hoặc phát hành release. Workflow kiểm tra toàn hệ sinh thái cũ còn phụ thuộc Void-bit thiếu nguồn.

Thứ tự đề xuất tiếp theo: khôi phục nguồn Void-bit → thống nhất API và cấu hình endpoint Studio/launcher → quản lý đề/test và reset phiên → kiểm thử UI, Windows/LAN → build gói và release.
