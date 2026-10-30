# Chính sách quyền riêng tư — DrgX IDE

**Cập nhật lần cuối:** 19/10/2026

DrgX IDE được thiết kế theo nguyên tắc **local-first**: mã nguồn, testcase, cấu hình và lịch sử làm việc được ưu tiên lưu trên máy của người dùng. Chính sách này giải thích DrgX xử lý dữ liệu như thế nào.

## 1. Dữ liệu được xử lý cục bộ

- Tệp mã nguồn, testcase, tệp cấu hình và lịch sử chạy bài nằm trong thư mục dự án trên máy người dùng.
- DrgX judge engine, exam server và stress tester chạy trên máy; không tự động gửi mã nguồn ra ngoài.
- Cài đặt giao diện, theme, phím tắt và trạng thái cửa sổ được lưu cục bộ.

## 2. Khi nào dữ liệu được gửi ra ngoài?

Chỉ khi người dùng **chủ động** sử dụng tính năng AI hoặc dịch vụ trực tuyến:

- **AI Agent/Copilot:** nội dung bạn gửi (prompt, đoạn mã được chọn) có thể được chuyển tới nhà cung cấp mô hình mà bạn chọn. DrgX không tự động gửi toàn bộ dự án.
- **Web lab:** máy chủ web lab do trường/đơn vị tự vận hành; quản trị viên của đơn vị có thể cấu hình ghi log theo chính sách của họ.
- **Cập nhật và tải xuống:** DrgX có thể kiểm tra phiên bản mới; thông tin gửi đi chỉ gồm phiên bản ứng dụng và hệ điều hành, không kèm mã nguồn.

DrgX **không bán dữ liệu**, không chèn quảng cáo trong editor và không dùng mã nguồn của người dùng để huấn luyện mô hình.

## 3. Nhà cung cấp AI

- Người dùng chọn mô hình/API key (BYOK) hoặc dùng mô hình miễn phí do DrgX cấu hình.
- Khi gọi AI, dữ liệu chịu thêm chính sách của nhà cung cấp mô hình đó. Người dùng nên đọc chính sách của nhà cung cấp trước khi gửi dữ liệu nhạy cảm.
- Không gửi thông tin cá nhân, mật khẩu, khóa API hoặc dữ liệu học sinh chưa được phép công bố vào prompt.

## 4. Dữ liệu của học sinh và nhà trường

- DrgX không yêu cầu tài khoản để dùng các tính năng cơ bản.
- Với gói trường/lab, nhà trường là đơn vị quản lý dữ liệu; DrgX cung cấp công cụ và hướng dẫn để nhà trường tuân thủ quy định bảo vệ dữ liệu.
- Không thu thập dữ liệu trẻ em cho mục đích quảng cáo.

## 5. Lưu trữ và xóa dữ liệu

- Dữ liệu cục bộ tồn tại cho đến khi người dùng xóa tệp hoặc gỡ ứng dụng.
- Dữ liệu gửi tới nhà cung cấp AI được lưu theo chính sách của nhà cung cấp; DrgX không kiểm soát thời hạn lưu của họ.
- Người dùng có thể xóa lịch sử, bộ nhớ đệm và cấu hình bằng cách xóa thư mục dữ liệu ứng dụng hoặc dùng chức năng reset.

## 6. Bảo mật

- Proxy nội bộ chỉ lắng nghe trên `127.0.0.1`, kiểm tra `Host`/`Origin` và yêu cầu bridge token sinh ngẫu nhiên, lưu trong hồ sơ người dùng; không mở công khai ra Internet.
- Learn Hub là trang tĩnh chạy cục bộ; tiến độ học tập (nếu người dùng đánh dấu) chỉ lưu trong `localStorage` của trình duyệt, không gửi lên máy chủ.
- Người dùng nên cập nhật Windows, WebView2 và DrgX để nhận bản vá bảo mật.

## 7. Thay đổi chính sách

Chính sách có thể được cập nhật khi sản phẩm thay đổi. Phiên bản mới sẽ được công bố trong kho lưu trữ và ghi ngày cập nhật ở đầu tài liệu.

## 8. Liên hệ

**Nhóm DrgX** — [[Trường/Xã/Phường]], tỉnh Phú Thọ.

- Email: [[Email]]
- Điện thoại: [[SĐT]]

> Tài liệu này mô tả nguyên tắc thiết kế và luồng dữ liệu dự kiến; trước khi triển khai thương mại, nhóm sẽ rà soát với chuyên gia pháp lý để bảo đảm tuân thủ Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và các quy định liên quan.
