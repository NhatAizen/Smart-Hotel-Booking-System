import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  FileText,
  HelpCircle,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import "./LegalInfoPage.css";

const PAGE_CONTENT = {
  "/about": {
    eyebrow: "VỀ ENZIUROOMS",
    title: "Nền tảng đặt phòng khách sạn thông minh",
    description:
      "EnziuRooms là hệ thống đặt phòng khách sạn được xây dựng để kết nối Customer, Hotel Admin và System Admin trong một luồng thống nhất từ tìm kiếm đến sau lưu trú.",
    icon: ShieldCheck,
    sections: [
      {
        title: "EnziuRooms tập trung vào điều gì?",
        points: [
          "Tìm kiếm khách sạn và loại phòng từ dữ liệu đang hoạt động trên hệ thống.",
          "Theo dõi booking, thanh toán, check-in, check-out và đánh giá sau lưu trú.",
          "Hỗ trợ đối tác khách sạn quản lý phòng, khuyến mãi, booking, đánh giá và vận hành tại quầy.",
          "Tích hợp Enziu AI để hỗ trợ tìm kiếm và so sánh dựa trên dữ liệu hệ thống.",
        ],
      },
      {
        title: "Nguyên tắc trải nghiệm",
        points: [
          "Không dùng dữ liệu khách sạn minh họa thay cho dữ liệu thật khi hệ thống đã có API tương ứng.",
          "Giá, tình trạng phòng và trạng thái booking cần được đối chiếu từ dịch vụ nghiệp vụ trước khi hiển thị kết luận.",
          "Các thao tác quan trọng được gắn với trạng thái để người dùng biết booking đang ở bước nào.",
        ],
      },
    ],
  },
  "/help": {
    eyebrow: "TRUNG TÂM TRỢ GIÚP",
    title: "Bạn cần hỗ trợ với EnziuRooms?",
    description:
      "Tổng hợp hướng dẫn nhanh cho những tình huống thường gặp khi tìm khách sạn, đặt phòng, thanh toán và nhận phòng.",
    icon: HelpCircle,
    sections: [
      {
        title: "Tìm và đặt phòng",
        points: [
          "Chọn điểm đến, ngày nhận/trả phòng và số khách trên thanh tìm kiếm.",
          "Mở khách sạn để xem thông tin, loại phòng, tiện nghi, vị trí và đánh giá thật.",
          "Chọn loại phòng phù hợp rồi tiếp tục theo luồng xác nhận đặt phòng.",
        ],
      },
      {
        title: "Sau khi đã đặt",
        points: [
          "Theo dõi booking trong mục Đơn đặt phòng.",
          "Theo dõi thanh toán, yêu cầu hoàn tiền và thông báo liên quan trong tài khoản.",
          "Khi tới khách sạn, sử dụng thông tin/QR check-in theo hướng dẫn hiển thị trong booking.",
        ],
      },
    ],
  },
  "/terms": {
    eyebrow: "ĐIỀU KHOẢN SỬ DỤNG",
    title: "Quy định sử dụng EnziuRooms",
    description:
      "Các nguyên tắc cơ bản khi sử dụng tài khoản và chức năng đặt phòng trên EnziuRooms.",
    icon: FileText,
    sections: [
      {
        title: "Tài khoản và thông tin cung cấp",
        points: [
          "Người dùng chịu trách nhiệm cung cấp thông tin cần thiết một cách chính xác khi đăng ký, đặt phòng và thực hiện các bước xác minh.",
          "Không sử dụng tài khoản để giả mạo, can thiệp trái phép hoặc thực hiện giao dịch gây ảnh hưởng tới người dùng/đối tác khác.",
          "Một số chức năng có thể yêu cầu điều kiện vai trò hoặc xác minh trước khi được sử dụng.",
        ],
      },
      {
        title: "Booking và sử dụng dịch vụ",
        points: [
          "Trạng thái booking trên hệ thống là căn cứ để xác định bước tiếp theo như thanh toán, nhận phòng, hủy hoặc đánh giá.",
          "Người dùng cần kiểm tra thông tin khách sạn, loại phòng, ngày ở, số khách và số tiền trước khi xác nhận.",
          "Đánh giá chỉ được thực hiện theo điều kiện nghiệp vụ của booking đã hoàn tất lưu trú.",
        ],
      },
    ],
  },
  "/privacy": {
    eyebrow: "CHÍNH SÁCH BẢO MẬT",
    title: "EnziuRooms sử dụng dữ liệu như thế nào?",
    description:
      "Mô tả ở mức sản phẩm về dữ liệu cần thiết để vận hành tài khoản, booking, thanh toán và hỗ trợ người dùng.",
    icon: LockKeyhole,
    sections: [
      {
        title: "Dữ liệu phục vụ tài khoản và booking",
        points: [
          "Thông tin hồ sơ, thông tin liên hệ và dữ liệu booking được dùng để cung cấp đúng chức năng cho tài khoản.",
          "Dữ liệu liên quan thanh toán được dùng để ghi nhận và đối chiếu trạng thái giao dịch trong hệ thống.",
          "Thông tin xác minh đối tác hoặc nhận phòng chỉ được sử dụng trong các luồng cần xác minh tương ứng.",
        ],
      },
      {
        title: "Nguyên tắc hiển thị và truy cập",
        points: [
          "Quyền truy cập dữ liệu phụ thuộc vai trò Customer, Hotel Admin và System Admin.",
          "Không công khai thông tin nhạy cảm chỉ để phục vụ mục đích giao diện.",
          "Các tệp/ảnh được hiển thị theo URL và quyền truy cập mà hệ thống đã cấu hình.",
        ],
      },
    ],
  },
  "/cancellation-policy": {
    eyebrow: "CHÍNH SÁCH HỦY PHÒNG",
    title: "Hủy booking trên EnziuRooms",
    description:
      "Khả năng hủy phụ thuộc trạng thái booking và các điều kiện nghiệp vụ đang áp dụng tại thời điểm yêu cầu.",
    icon: XCircle,
    sections: [
      {
        title: "Trước khi hủy",
        points: [
          "Kiểm tra trạng thái booking, thời gian lưu trú và thông tin thanh toán đang hiển thị.",
          "Nút hủy chỉ nên xuất hiện khi booking vẫn thuộc trạng thái hệ thống cho phép xử lý hủy.",
          "Nếu booking đã chuyển sang giai đoạn lưu trú hoặc hoàn tất, thao tác hủy có thể không còn khả dụng.",
        ],
      },
      {
        title: "Sau khi hủy",
        points: [
          "Booking được cập nhật trạng thái để người dùng và khách sạn cùng theo dõi.",
          "Nếu phát sinh hoàn tiền, yêu cầu hoàn được xử lý theo chính sách hoàn tiền và trạng thái giao dịch liên quan.",
        ],
      },
    ],
  },
  "/refund-policy": {
    eyebrow: "CHÍNH SÁCH HOÀN TIỀN",
    title: "Theo dõi hoàn tiền minh bạch",
    description:
      "EnziuRooms lưu yêu cầu hoàn tiền theo trạng thái để Customer và bộ phận quản trị theo dõi quá trình xử lý.",
    icon: RefreshCcw,
    sections: [
      {
        title: "Khi nào phát sinh yêu cầu hoàn?",
        points: [
          "Yêu cầu hoàn tiền chỉ có ý nghĩa khi booking/giao dịch đáp ứng điều kiện nghiệp vụ tương ứng.",
          "Số tiền và lý do xử lý được đối chiếu với dữ liệu booking và thanh toán trên hệ thống.",
          "Người dùng không nên coi trạng thái gửi yêu cầu là đã hoàn tiền thành công cho đến khi trạng thái xử lý xác nhận hoàn tất.",
        ],
      },
      {
        title: "Theo dõi tiến trình",
        points: [
          "Trạng thái yêu cầu hoàn tiền được lưu để tránh xử lý mơ hồ hoặc lặp giao dịch.",
          "Các bước duyệt/xử lý của quản trị viên cần để lại kết quả rõ ràng để Customer có thể theo dõi.",
        ],
      },
    ],
  },
  "/payment-policy": {
    eyebrow: "QUY ĐỊNH THANH TOÁN",
    title: "Thanh toán và ghi nhận giao dịch",
    description:
      "EnziuRooms hiển thị các khoản cần thanh toán theo booking và đồng bộ trạng thái giao dịch về hệ thống.",
    icon: WalletCards,
    sections: [
      {
        title: "Trước khi thanh toán",
        points: [
          "Kiểm tra khách sạn, loại phòng, ngày ở, số khách, ưu đãi và tổng tiền trước khi xác nhận.",
          "Số tiền hiển thị ở bước cuối cần được backend tính/đối chiếu lại thay vì chỉ tin giá tạm tính trên giao diện.",
          "Không đóng hoặc sửa dữ liệu booking trong lúc giao dịch đang được xử lý nếu hệ thống chưa trả kết quả.",
        ],
      },
      {
        title: "Sau khi thanh toán",
        points: [
          "Trạng thái giao dịch được đồng bộ về booking và khu vực thanh toán của tài khoản.",
          "Nếu giao dịch bị hủy hoặc thất bại, người dùng cần dựa trên trạng thái hệ thống thay vì ảnh/chứng từ ngoài luồng.",
          "Các yêu cầu hoàn tiền được xử lý tách khỏi thao tác thanh toán ban đầu và có trạng thái riêng.",
        ],
      },
    ],
  },
};

export default function LegalInfoPage() {
  const location = useLocation();
  const { openAssistant } = useAiAssistant();
  const content = PAGE_CONTENT[location.pathname] ?? PAGE_CONTENT["/help"];
  const Icon = content.icon;

  return (
    <main className="legal-info-page">
      <section className="legal-info-hero">
        <div className="container">
          <Link to="/" className="legal-back-link">
            <ArrowLeft size={17} />
            Về trang chủ
          </Link>

          <div className="legal-info-heading">
            <span className="legal-info-icon"><Icon size={28} /></span>
            <div>
              <span className="legal-info-eyebrow">{content.eyebrow}</span>
              <h1>{content.title}</h1>
              <p>{content.description}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="legal-info-content">
        <div className="container legal-info-layout">
          <div className="legal-info-sections">
            {content.sections.map((section) => (
              <article key={section.title} className="legal-info-card">
                <h2>{section.title}</h2>
                <ul>
                  {section.points.map((point) => (
                    <li key={point}>
                      <CheckCircle2 size={17} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <aside className="legal-help-card">
            <Bot size={28} />
            <h2>Cần giải thích thêm?</h2>
            <p>Enziu AI có thể hỗ trợ giải thích luồng sử dụng và các bước thao tác trên hệ thống.</p>
            <button
              type="button"
              onClick={() => openAssistant({ clearHotelContext: true })}
            >
              Hỏi Enziu AI
            </button>
            <small>
              Nội dung trang này mô tả quy định sử dụng trong phạm vi hệ thống EnziuRooms của đồ án và không thay thế tư vấn pháp lý chuyên nghiệp.
            </small>
          </aside>
        </div>
      </section>
    </main>
  );
}
