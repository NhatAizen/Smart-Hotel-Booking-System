package com.smarthotel.ai.assistant.v2.service;

import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/** Reviewed product guidance. Dynamic prices, policies and bookings belong to the data services. */
@Service
public class SystemKnowledgeService {
    public static final String MODEL = "enziuroom-local-v5";
    private static final List<Topic> TOPICS = List.of(
            topic("ENGINE", "gemini|chatgpt|mo hinh|xu ly noi bo|tra loi tu dong",
                    "Trợ lý EnziuRooms phân tích câu hỏi bằng mô hình chạy nội bộ, sau đó tra cứu dữ liệu hệ thống. Không gọi Gemini hay API mô hình bên ngoài. Khi mô hình nội bộ không sẵn sàng, trợ lý dùng chế độ cơ bản."),
            topic("PASSWORD", "quen mat khau|doi mat khau|forgot password|reset password",
                    "Chọn ‘Quên mật khẩu?’ ở màn hình đăng nhập, nhập email tài khoản và làm theo hướng dẫn đặt lại mật khẩu."),
            topic("REGISTER", "dang ky|tao tai khoan|register|sign up",
                    "Chọn Đăng ký, điền thông tin theo biểu mẫu và hoàn tất bước xác minh được yêu cầu để tạo tài khoản EnziuRooms."),
            topic("LOGIN", "dang nhap|login|sign in",
                    "Chọn Đăng nhập và dùng tài khoản đã đăng ký. Nếu quên mật khẩu, chọn ‘Quên mật khẩu?’ để đặt lại."),
            topic("QR", "qr|ma nhan phong|ma check.?in",
                    "Mở đơn đã xác nhận trong mục Đặt phòng để xem QR nhận phòng. QR giúp khách sạn tra cứu đơn và xác minh; khách sạn xác nhận nhận phòng khi các điều kiện được đáp ứng."),
            topic("CANCELLATION", "hoan tien|refund|phi huy|huy phong|huy don|huy booking|huy dat phong|cancel",
                    "Mở đơn trong mục Đặt phòng để xem điều kiện hủy và hoàn tiền. Đơn đã nhận hoặc trả phòng không thể hủy. Quyền hoàn phụ thuộc điều kiện đã ghi nhận của đơn; mức hoàn và thời hạn cần khách sạn xác nhận."),
            topic("DEPOSIT", "dat coc|tien coc|deposit",
                    "Chọn Đặt cọc nếu loại phòng cho phép. Tỷ lệ và số tiền cọc hiển thị trước khi xác nhận; phần còn lại xem trong chi tiết đơn. Cần thanh toán đủ để nhận phòng."),
            topic("PAYMENT", "thanh toan|payos|vietqr|payment",
                    "EnziuRooms hỗ trợ trả tại khách sạn, đặt cọc hoặc trả toàn bộ tùy loại phòng. Khi thanh toán online, chọn PayOS/VietQR hoặc Ví Enziu nếu được hiển thị. Kiểm tra số tiền và trạng thái trong chi tiết đơn."),
            topic("CHECK_OUT", "tra phong|check.?out|don phong|cleaning",
                    "Giờ trả phòng nằm trong chi tiết khách sạn hoặc đơn đặt. Cần thanh toán đủ trước khi khách sạn xác nhận trả phòng. Sau đó phòng chuyển sang chờ dọn và chỉ mở lại khi khách sạn xác nhận dọn xong."),
            topic("CHECK_IN", "nhan phong|check.?in|cccd|giay to",
                    "Xem giờ nhận phòng trong chi tiết khách sạn hoặc đơn đặt. Xuất trình QR đơn và giấy tờ theo yêu cầu; khách sạn xác minh và xác nhận nhận phòng sau khi đơn được xác nhận, thanh toán đủ và đáp ứng điều kiện áp dụng."),
            topic("ROOM_CHANGE", "doi(?: loai| hang)? phong|room change",
                    "Mở đơn đặt phòng, chọn yêu cầu đổi phòng nếu có và gửi khách sạn xem xét. Khả năng đổi và chênh lệch tiền phụ thuộc phòng trống cùng điều kiện của đơn."),
            topic("PROMOTION", "khuyen mai|voucher|ma giam|uu dai|promotion",
                    "Nhập mã ưu đãi tại bước đặt phòng và kiểm tra khoản giảm trước khi xác nhận. Mã chỉ áp dụng khi đáp ứng điều kiện; giá cuối cùng hiển thị ở bước thanh toán."),
            topic("WRITE_REVIEW", "viet danh gia|gui danh gia|danh gia sau|review sau",
                    "Sau khi hoàn tất lưu trú, mở đơn trong mục Đặt phòng và chọn Đánh giá nếu được hiển thị. Nhập điểm và nhận xét về trải nghiệm thực tế."),
            topic("SUPPORT", "khieu nai|ho tro|lien he|complaint|support",
                    "Mở đơn đặt phòng để gửi yêu cầu hỗ trợ hoặc nhắn khách sạn. Với khiếu nại, mô tả vấn đề và gửi bằng chứng nếu có; khách sạn sẽ xem xét yêu cầu."),
            topic("WALLET", "vi enziu|so du vi|wallet",
                    "Mở Ví Enziu để xem số dư và lịch sử giao dịch. Nếu bước thanh toán có tùy chọn Ví Enziu, bạn có thể chọn và kiểm tra số tiền trước khi xác nhận."),
            topic("POLICY", "thu cung|vat nuoi|hut thuoc|to chuc tiec|gio yen tinh|chinh sach|quy dinh|do tuoi",
                    "Quy định về vật nuôi, hút thuốc, giờ yên tĩnh, giấy tờ và độ tuổi nằm trong mục Điều kiện đặt phòng. Hãy chọn khách sạn và xem điều kiện áp dụng trước khi xác nhận; không có một quy định chung cho mọi khách sạn."),
            topic("BOOKING_GUIDE", "cach dat|dat phong nhu|dat phong the nao|huong dan dat|lam sao.*dat|book a room",
                    "Chọn điểm đến, ngày nhận/trả và số khách → chọn khách sạn, loại phòng → điền thông tin → kiểm tra giá, điều kiện và xác nhận đặt phòng."),
            topic("ABOUT", "enziu(room|rooms)?|he thong.*(la gi|lam gi)|ban.*(lam gi|giup gi)",
                    "EnziuRooms là hệ thống đặt phòng khách sạn. Tôi hỗ trợ tìm và so sánh khách sạn, xem đánh giá, tra cứu đơn của bạn và hướng dẫn thanh toán, hủy hoặc nhận/trả phòng.")
    );

    public Optional<String> lookup(String message) {
        String text = normalize(message);
        return TOPICS.stream().filter(topic -> topic.pattern().matcher(text).find())
                .map(Topic::answer).findFirst();
    }

    /** Procedural questions use reviewed guidance even when they mention an owned booking. */
    public Optional<String> proceduralTopic(String message) {
        String text = normalize(message);
        if (!text.matches(".*(lam sao|nhu the nao|huong dan|cac buoc|quy trinh|thu tuc|cach ).*")) return Optional.empty();
        if (text.matches(".*(may gio|bao nhieu|dia chi|so dien thoai).*") ) return Optional.empty();
        return TOPICS.stream().filter(topic -> !"ABOUT".equals(topic.id()))
                .filter(topic -> topic.pattern().matcher(text).find()).map(Topic::id).findFirst();
    }

    public String answer(String message) {
        String text = normalize(message);
        if (text.matches("(xin chao|chao( ban)?|hello|hi|cam on|thanks)[!. ]*")) {
            return "Tôi có thể giúp bạn tìm phòng, xem đơn đặt và giải đáp cách sử dụng EnziuRooms.";
        }
        return lookup(message).orElse("Tôi chỉ hỗ trợ các câu hỏi liên quan đến EnziuRooms. Bạn cần hỏi về đặt phòng, thanh toán, đơn của mình hay nhận/trả phòng?");
    }

    public static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}+", "")
                .replace('đ', 'd').replace('Đ', 'D').toLowerCase(Locale.ROOT)
                .replaceAll("\\s+", " ").trim();
    }

    public Optional<String> answerTopic(String id) {
        if (id == null) return Optional.empty();
        return TOPICS.stream().filter(topic -> id.equals(topic.id())).map(Topic::answer).findFirst();
    }

    private static Topic topic(String id, String expression, String answer) {
        return new Topic(id, Pattern.compile("(?:^|[^a-z0-9])(?:" + expression + ")(?:$|[^a-z0-9])"), answer);
    }

    private record Topic(String id, Pattern pattern, String answer) {}
}
