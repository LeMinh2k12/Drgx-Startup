# Dashboard giáo viên & Local OJ

Khởi chạy từ thư mục gốc repository:

```sh
python scripts/classroom.py --doctor
python scripts/classroom.py
```

- Giáo viên: http://127.0.0.1:8765/dashboard — tạo phòng, mở phòng bằng mã, xem bảng điểm, xuất CSV và sao chép liên kết cho học sinh.
- Học sinh: http://127.0.0.1:8765/oj — nhập mã 6 ký tự và họ tên/SBD, dán mã C++17 hoặc Python, nộp và xem verdict từng test.
- `/join` là đường dẫn khác của trang học sinh; `/oj?code=ABC123` điền sẵn mã phòng.
- CP Studio có hai lệnh mới: **Dashboard giáo viên Local**, **Mở Local OJ / Nhập mã phòng**, cũng xuất hiện ở trang chủ extension.

Dashboard không tự tạo phòng khi mở. Có thể đóng/mở lại lượt vào phòng và nhận bài; bài đã được server tiếp nhận trước khi đóng vẫn chấm và lưu kết quả. Dashboard làm mới phòng đang chọn mỗi 5 giây khi tab hiển thị. Giáo viên cần tạo phòng và cung cấp đề bài/bộ test theo cấu trúc của Exam Server hiện có. Trang OJ này dùng `/submit` của CP Exam Server, không thay thế danh mục bài tập Void-bit (:8080).

## Dùng trong mạng LAN

Mặc định server chỉ lắng nghe loopback. Để học sinh truy cập qua IP LAN của máy giáo viên, đặt `DRGX_CP_SERVER_HOST=0.0.0.0` trước khi chạy, mở cổng 8765 trong firewall mạng riêng, rồi mở dashboard bằng IP LAN trước khi sao chép liên kết. Liên kết dùng cùng host với dashboard; không gửi liên kết `127.0.0.1` cho máy khác.

Dashboard/API quản trị vẫn áp dụng quyền localhost hoặc admin token có sẵn. Khi cấu hình `DRGX_ADMIN_TOKEN`, nhập token ở ô Admin token trên dashboard và bấm Kết nối / Làm mới. Token chỉ giữ trong ô nhập, không lưu localStorage hoặc đặt trên URL. Xuất CSV cũng gửi header quản trị. CP Studio hiện tạo phòng trực tiếp được khi server cho phép quyền localhost; nếu server yêu cầu token, tạo phòng qua dashboard.

Chỉ dùng trên máy/mạng tin cậy: engine thực thi mã học sinh trên máy chủ, không phải sandbox an toàn để công khai Internet. Nộp bài bắt buộc có studentToken của tên/SBD đã vào phòng; không còn cho phép nộp anonymous hoặc dựa vào IP để giả định danh tính. Vào lại tên đã đăng ký cũng cần đúng token. Web giữ phiên trong sessionStorage của tab (khôi phục khi tải lại); extension lưu token theo server/phòng/tên trong VS Code SecretStorage. Đóng tab có thể mất phiên; hiện chưa có chức năng khôi phục/đặt lại phiên cho giáo viên. Mã nguồn trên trang không được lưu vào localStorage.

API web dùng cùng origin, không mở CORS wildcard; POST khác origin bị từ chối. Client tích hợp cũ phải gọi `/exam/join` rồi gửi studentToken khi nộp. Bộ chấm Linux hiện dùng subprocess, không có mức cô lập tương đương Windows Restricted Token/Job Object. Không coi các bộ lọc mã nguồn là sandbox an toàn tuyệt đối.

## Kiểm tra

```sh
python -m unittest discover -s products/drgx-cp/server/test_suite
node --check products/drgx-cp/extension/extension.js
```

Test dùng dữ liệu và bộ test tạm, kiểm tra trang, mã phòng, payload, quản trị, origin, chống mạo danh, đóng/mở phòng, lưu audit chain và chấm mã C++/Python kiểm soát sẵn (AC/WA/CE/NO_OUT). C++ được bỏ qua nếu không có g++. Windows CI được cấu hình nhưng cần chờ chạy trên GitHub; kết quả Linux không thay thế kiểm tra Windows.

```sh
python scripts/check_classroom_js.py
```

Bộ workflow Classroom độc lập không cần Void-bit. Workflow kiểm tra toàn hệ sinh thái cũ vẫn cần đầy đủ mã nguồn Void-bit và các tài nguyên nền tảng.
