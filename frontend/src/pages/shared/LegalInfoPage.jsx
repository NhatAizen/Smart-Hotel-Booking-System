import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BookOpenCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Database,
  FileCheck2,
  FileText,
  Fingerprint,
  HelpCircle,
  Hotel,
  KeyRound,
  Landmark,
  LockKeyhole,
  MessageSquareText,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Scale,
  ShieldCheck,
  TriangleAlert,
  UserRoundCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { getPlatformPolicy } from "../../services/policyService";
import "./LegalInfoPage.css";

const POLICY_NAV = [
  ["/terms", "Điều khoản"],
  ["/privacy", "Bảo mật"],
  ["/cancellation-policy", "Hủy phòng"],
  ["/refund-policy", "Hoàn tiền"],
  ["/payment-policy", "Thanh toán"],
];

const STATUS_LABELS = {
  PENDING: "Chờ xử lý",
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đang lưu trú",
  CHECKED_OUT: "Đã trả phòng",
  CANCELLED: "Đã hủy",
  NO_SHOW: "Không đến nhận phòng",
};

const PAGE_META = {
  "/terms": {
    theme: "terms",
    eyebrow: "ENZIUROOMS · VĂN BẢN ÁP DỤNG",
    title: "Điều khoản sử dụng EnziuRooms",
    description:
      "Điều khoản này quy định quyền và nghĩa vụ khi sử dụng EnziuRooms, bao gồm tài khoản, đặt phòng, thanh toán, nhận phòng, nội dung người dùng và trách nhiệm của các bên.",
    icon: FileText,
    chips: ["Tài khoản", "Đặt phòng", "Thanh toán", "Check-in", "Nội dung & đánh giá"],
    version: "Phiên bản 1.0",
    updated: "Cập nhật 29/08/2026",
  },
  "/privacy": {
    theme: "privacy",
    eyebrow: "ENZIUROOMS · QUYỀN RIÊNG TƯ",
    title: "Chính sách bảo mật và dữ liệu cá nhân",
    description:
      "Chính sách này giải thích các nhóm dữ liệu EnziuRooms xử lý, mục đích sử dụng, phạm vi truy cập và các biện pháp bảo vệ dữ liệu trong quá trình cung cấp dịch vụ.",
    icon: LockKeyhole,
    chips: ["Tài khoản", "Đặt phòng", "Thanh toán", "Xác minh danh tính / CCCD", "Phân quyền"],
    version: "Phiên bản 1.0",
    updated: "Cập nhật 29/08/2026",
  },
  "/cancellation-policy": {
    theme: "cancel",
    eyebrow: "ENZIUROOMS · ĐẶT PHÒNG",
    title: "Chính sách hủy phòng",
    description:
      "Chính sách này quy định việc hủy đơn đặt phòng, thời điểm có thể hủy, mối quan hệ giữa trạng thái đơn đặt phòng và quyền hoàn tiền, cùng các trường hợp cần đối chiếu với điều kiện của khách sạn hoặc loại phòng.",
    icon: XCircle,
    chips: ["Điều kiện đặt phòng", "Trước nhận phòng", "Không đến nhận phòng", "Khác với hoàn tiền"],
    version: "Phiên bản 1.0",
    updated: "Cập nhật 29/08/2026",
  },
  "/refund-policy": {
    theme: "refund",
    eyebrow: "ENZIUROOMS · GIAO DỊCH",
    title: "Chính sách hoàn tiền",
    description:
      "Chính sách này mô tả điều kiện tiếp nhận yêu cầu hoàn tiền, cách đối chiếu đơn đặt phòng và giao dịch, nguồn tiền, trạng thái xử lý và trách nhiệm của các bên trong quá trình hoàn tiền.",
    icon: RefreshCcw,
    chips: ["Điều kiện hoàn", "Nguồn tiền", "Duyệt yêu cầu", "Đối soát"],
    version: "Phiên bản 1.0",
    updated: "Cập nhật 29/08/2026",
  },
  "/payment-policy": {
    theme: "payment",
    eyebrow: "ENZIUROOMS · GIAO DỊCH",
    title: "Chính sách thanh toán",
    description:
      "Chính sách này quy định cách xác định số tiền phải thanh toán, các phương thức thanh toán được hỗ trợ, khoản đặt cọc, phần còn lại và cách hệ thống ghi nhận trạng thái giao dịch.",
    icon: WalletCards,
    chips: ["PayOS", "Ví Enziu", "Đặt cọc", "Thanh toán toàn bộ", "Tại khách sạn"],
    version: "Phiên bản 1.0",
    updated: "Cập nhật 29/08/2026",
  },
};

const BASIC_CONTENT = {
  "/about": {
    eyebrow: "VỀ ENZIUROOMS",
    title: "Nền tảng đặt phòng khách sạn thông minh",
    description:
      "EnziuRooms kết nối Khách hàng, Đối tác khách sạn và Bộ phận quản trị EnziuRooms trong một hành trình thống nhất từ tìm kiếm đến sau lưu trú.",
    icon: ShieldCheck,
    sections: [
      {
        title: "EnziuRooms tập trung vào điều gì?",
        points: [
          "Tìm kiếm khách sạn và loại phòng từ dữ liệu đang hoạt động trên hệ thống.",
          "Theo dõi đơn đặt phòng, thanh toán, nhận phòng, trả phòng và đánh giá sau lưu trú.",
          "Hỗ trợ đối tác khách sạn quản lý phòng, khuyến mãi, đơn đặt phòng, đánh giá và vận hành tại quầy.",
          "Tích hợp Enziu AI để hỗ trợ tìm kiếm và so sánh dựa trên thông tin trên EnziuRooms.",
        ],
      },
    ],
  },
  "/help": {
    eyebrow: "TRUNG TÂM TRỢ GIÚP",
    title: "Bạn cần hỗ trợ với EnziuRooms?",
    description:
      "Hướng dẫn nhanh cho những tình huống thường gặp khi tìm khách sạn, đặt phòng, thanh toán và nhận phòng.",
    icon: HelpCircle,
    sections: [
      {
        title: "Tìm và đặt phòng",
        points: [
          "Chọn điểm đến, ngày nhận/trả phòng và số khách trên thanh tìm kiếm.",
          "Mở khách sạn để xem thông tin, loại phòng, tiện nghi, vị trí và đánh giá.",
          "Chọn loại phòng phù hợp rồi tiếp tục theo luồng xác nhận đặt phòng.",
        ],
      },
      {
        title: "Sau khi đã đặt",
        points: [
          "Theo dõi đơn đặt phòng trong mục Đơn đặt phòng.",
          "Theo dõi thanh toán, yêu cầu hoàn tiền và thông báo liên quan trong tài khoản.",
          "Khi tới khách sạn, sử dụng mã QR đặt phòng và thực hiện các bước xác minh được hiển thị tại quầy.",
        ],
      },
    ],
  },
};

function statusList(policy) {
  const values = Array.isArray(policy?.refundRequestEligibleBookingStatuses)
    ? policy.refundRequestEligibleBookingStatuses
    : ["CANCELLED", "NO_SHOW"];
  return values.map((value) => STATUS_LABELS[value] ?? value).join(" / ");
}

function PolicyNav({ pathname }) {
  return (
    <nav className="legal-policy-nav" aria-label="Điều hướng chính sách EnziuRooms">
      {POLICY_NAV.map(([to, label]) => (
        <Link key={to} to={to} className={pathname === to ? "active" : ""}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function PolicySection({ id, number, title, lead, icon: Icon = FileCheck2, children }) {
  return (
    <section id={id} className="policy-document-section">
      <header className="policy-document-section-head">
        <span className="policy-document-section-number">{number}</span>
        <span className="policy-document-section-icon"><Icon size={20} /></span>
        <div>
          <h2>{title}</h2>
          {lead ? <p>{lead}</p> : null}
        </div>
      </header>
      <div className="policy-document-section-body">{children}</div>
    </section>
  );
}

function BulletList({ items, warning = false }) {
  return (
    <ul className={`policy-bullet-list${warning ? " is-warning" : ""}`}>
      {items.map((item) => (
        <li key={item}>
          {warning ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DefinitionGrid({ items }) {
  return (
    <div className="policy-definition-grid">
      {items.map(([title, body]) => (
        <article key={title}>
          <strong>{title}</strong>
          <p>{body}</p>
        </article>
      ))}
    </div>
  );
}

function TermsContent() {
  const toc = [
    ["terms-scope", "Phạm vi & chấp thuận"],
    ["terms-account", "Tài khoản & danh tính"],
    ["terms-booking", "Đặt phòng & quan hệ với khách sạn"],
    ["terms-price", "Giá, ưu đãi & thông tin hiển thị"],
    ["terms-payment", "Thanh toán, hủy & hoàn"],
    ["terms-checkin", "Check-in, QR & xác minh"],
    ["terms-content", "Đánh giá, chat & nội dung"],
    ["terms-prohibited", "Hành vi bị cấm"],
    ["terms-responsibility", "Trách nhiệm & gián đoạn dịch vụ"],
    ["terms-change", "Thay đổi điều khoản"],
  ];

  return (
    <div className="policy-long-layout">
      <aside className="policy-toc">
        <small>MỤC LỤC</small>
        <strong>Điều khoản sử dụng</strong>
        <nav>{toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </aside>

      <article className="policy-long-document">
        <div className="policy-summary-banner">
          <BookOpenCheck size={24} />
          <div><strong>Tóm tắt quan trọng</strong><p>EnziuRooms là nền tảng kết nối Khách hàng và khách sạn. Quy định của EnziuRooms áp dụng cho việc sử dụng nền tảng; quy định lưu trú riêng do từng khách sạn cấu hình được hiển thị tại trang chi tiết khách sạn và Điều kiện đặt phòng.</p></div>
        </div>

        <PolicySection id="terms-scope" number="01" title="Phạm vi áp dụng và việc chấp thuận điều khoản" lead="Khi tạo tài khoản, sử dụng chức năng đặt phòng hoặc tiếp tục giao dịch, bạn phải đọc các điều kiện áp dụng cho hành động đó." icon={Scale}>
          <DefinitionGrid items={[
            ["EnziuRooms", "Nền tảng cung cấp công cụ tìm kiếm, đặt phòng, thanh toán, theo dõi đơn đặt phòng, hỗ trợ nhận phòng và các chức năng liên quan."],
            ["Khách hàng", "Người tìm kiếm, đặt phòng, thanh toán hoặc sử dụng các tính năng dành cho khách lưu trú."],
            ["Đối tác khách sạn", "Đối tác được cấp quyền quản lý khách sạn, loại phòng, đơn đặt phòng và quy định lưu trú thuộc phạm vi của mình."],
            ["Điều kiện đặt phòng", "Các điều kiện cụ thể được chốt cho một đơn đặt phòng như khách sạn, loại phòng, ngày ở, giá, khoản cọc và quy định liên quan."],
          ]} />
          <p className="policy-paragraph">Nếu một điều kiện trong Điều kiện đặt phòng khác với nội dung mô tả chung trên trang chính sách, điều kiện cụ thể đã được hiển thị và xác nhận cho đơn đặt phòng đó được ưu tiên trong phạm vi mà hệ thống cho phép.</p>
        </PolicySection>

        <PolicySection id="terms-account" number="02" title="Tài khoản, thông tin cá nhân và bảo mật đăng nhập" lead="Mỗi tài khoản phải được sử dụng đúng người, đúng vai trò và đúng phạm vi quyền." icon={UserRoundCheck}>
          <BulletList items={[
            "Bạn chịu trách nhiệm cung cấp thông tin chính xác khi đăng ký, đặt phòng và thực hiện các bước xác minh.",
            "Không được chia sẻ mật khẩu, mã xác thực hoặc quyền truy cập tài khoản cho người khác sử dụng trái phép.",
            "Khách hàng không được can thiệp đơn đặt phòng của tài khoản khác; Đối tác khách sạn không được quản lý khách sạn ngoài phạm vi được cấp quyền.",
            "EnziuRooms có thể hạn chế thao tác hoặc khóa quyền truy cập khi phát hiện hành vi có dấu hiệu gian lận, chiếm quyền hoặc lạm dụng hệ thống.",
          ]} />
        </PolicySection>

        <PolicySection id="terms-booking" number="03" title="Đặt phòng và mối quan hệ giữa Khách hàng – khách sạn – EnziuRooms" lead="Một đơn đặt phòng chỉ có hiệu lực theo trạng thái được EnziuRooms ghi nhận, không dựa vào ảnh chụp màn hình hoặc thông tin cũ còn lưu trên trình duyệt." icon={Hotel}>
          <BulletList items={[
            "Khách hàng cần kiểm tra khách sạn, loại phòng, ngày nhận/trả, số khách, giá và các quy định quan trọng trước khi xác nhận.",
            "Khách sạn chịu trách nhiệm về thông tin vận hành do Đối tác khách sạn cấu hình như giờ nhận/trả phòng, vật nuôi, hút thuốc, trẻ em hoặc quy định chỗ nghỉ.",
            "EnziuRooms chịu trách nhiệm vận hành luồng hệ thống, ghi nhận trạng thái đơn đặt phòng và kết nối các bước thanh toán/nhận phòng theo thông tin đã ghi nhận.",
            "Số lượng phòng và trạng thái khả dụng có thể thay đổi theo tình trạng đặt phòng; kết quả tại thời điểm hệ thống xác nhận là căn cứ cuối cùng.",
          ]} />
          <div className="policy-inline-callout"><Building2 size={19} /><div><strong>Hai lớp chính sách</strong><p>“Chính sách EnziuRooms” là quy định nền tảng. “Quy định chỗ nghỉ” là nội quy riêng của từng khách sạn. Khách hàng cần xem cả hai trước khi đặt.</p></div></div>
        </PolicySection>

        <PolicySection id="terms-price" number="04" title="Giá phòng, ưu đãi, voucher và dữ liệu hiển thị" lead="Giá hiển thị ở giao diện có thể là dữ liệu tạm tính; tổng tiền cuối cùng phải được hệ thống xác nhận tại bước đặt phòng." icon={ReceiptText}>
          <BulletList items={[
            "Giá có thể phụ thuộc loại phòng, ngày ở, chính sách giá ngày thường/cuối tuần/ngày lễ và chương trình ưu đãi đang hoạt động.",
            "Voucher chỉ được áp dụng khi thỏa điều kiện mà hệ thống kiểm tra tại thời điểm xác nhận.",
            "Không được lợi dụng lỗi hiển thị, gửi thao tác lặp hoặc can thiệp bất thường vào quá trình đặt phòng để nhận mức giá hay ưu đãi không hợp lệ.",
            "Nếu dữ liệu hiển thị và kết quả tính toán của hệ thống khác nhau, hệ thống phải yêu cầu Khách hàng xem lại tổng tiền trước khi tiếp tục thanh toán.",
          ]} />
        </PolicySection>

        <PolicySection id="terms-payment" number="05" title="Thanh toán, hủy phòng và hoàn tiền" lead="Ba nghiệp vụ này liên quan nhau nhưng là ba bước riêng biệt." icon={CreditCard}>
          <DefinitionGrid items={[
            ["Thanh toán", "Ghi nhận khoản Khách hàng đã trả bằng kênh được hỗ trợ và trạng thái giao dịch tương ứng."],
            ["Hủy đặt phòng", "Kết thúc nhu cầu lưu trú của đơn đặt phòng khi trạng thái còn cho phép; hủy không đồng nghĩa với hoàn tiền."],
            ["Hoàn tiền", "Workflow riêng để xác định khoản nào đủ điều kiện hoàn, ai xử lý và khi nào được đánh dấu hoàn tất."],
          ]} />
          <div className="policy-related-links"><Link to="/payment-policy">Chính sách thanh toán <ChevronRight size={16} /></Link><Link to="/cancellation-policy">Chính sách hủy phòng <ChevronRight size={16} /></Link><Link to="/refund-policy">Chính sách hoàn tiền <ChevronRight size={16} /></Link></div>
        </PolicySection>

        <PolicySection id="terms-checkin" number="06" title="Nhận phòng, mã QR đặt phòng và xác minh tại quầy" lead="Mã QR hỗ trợ tra cứu đơn đặt phòng; không phải là bằng chứng duy nhất để tự động nhận phòng." icon={Fingerprint}>
          <BulletList items={[
            "Đối tác khách sạn chỉ xác nhận nhận phòng khi đơn đặt phòng ở đúng trạng thái và các điều kiện thanh toán, xác minh cần thiết đã được đáp ứng.",
            "Khách hàng có thể được yêu cầu xuất trình giấy tờ theo quy trình nhận phòng hoặc quy định của khách sạn.",
            "Độ tuổi tối thiểu và các quy định chung được áp dụng theo cấu hình hiện hành của EnziuRooms.",
            "mã QR đặt phòng không được chia sẻ công khai nếu có thể làm lộ thông tin đơn đặt phòng hoặc tạo rủi ro bị người khác sử dụng sai mục đích.",
          ]} />
        </PolicySection>

        <PolicySection id="terms-content" number="07" title="Đánh giá, chat, phản hồi và nội dung do người dùng cung cấp" lead="Nội dung phải phản ánh trải nghiệm hoặc trao đổi thực tế, không được dùng để giả mạo hay gây nhầm lẫn." icon={MessageSquareText}>
          <BulletList items={[
            "Quyền đánh giá chỉ mở khi kỳ lưu trú đã hoàn tất theo điều kiện áp dụng.",
            "Không đăng nội dung spam, đe dọa, xúc phạm, giả mạo, chứa mã độc hoặc cố tình tiết lộ dữ liệu cá nhân của người khác.",
            "Đối tác khách sạn có thể phản hồi đánh giá trong phạm vi chức năng được cấp; phản hồi cũng phải tuân thủ quy tắc nội dung.",
            "Bộ phận quản trị EnziuRooms có thể xử lý nội dung vi phạm theo quyền quản trị và yêu cầu an toàn nền tảng.",
          ]} />
        </PolicySection>

        <PolicySection id="terms-prohibited" number="08" title="Các hành vi bị cấm" lead="Những hành vi dưới đây có thể dẫn đến giới hạn chức năng, khóa tài khoản hoặc xử lý theo cơ chế quản trị." icon={TriangleAlert}>
          <BulletList warning items={[
            "Khai thác lỗ hổng, vượt quyền truy cập hoặc cố tình can thiệp vào thông tin, đơn đặt phòng hay tài khoản của người khác.",
            "Gian lận thanh toán, hoàn tiền, ưu đãi, ví, đặt phòng hoặc tạo giao dịch giả nhằm chiếm lợi ích không hợp lệ.",
            "Giả mạo khách sạn, đối tác, Khách hàng hoặc sử dụng thông tin nhận dạng của người khác trái phép.",
            "Sử dụng công cụ tự động để spam, dò quét, gây quá tải hoặc làm gián đoạn hoạt động của EnziuRooms.",
          ]} />
        </PolicySection>

        <PolicySection id="terms-responsibility" number="09" title="Trách nhiệm vận hành, dữ liệu và gián đoạn dịch vụ" lead="EnziuRooms cố gắng duy trì dữ liệu nhất quán nhưng một hệ thống trực tuyến vẫn có thể gặp gián đoạn kỹ thuật." icon={Database}>
          <BulletList items={[
            "Trạng thái hệ thống và dữ liệu giao dịch là nguồn tham chiếu chính khi có khác biệt với giao diện tạm thời.",
            "Trong sự cố kỹ thuật, EnziuRooms có thể tạm dừng thao tác nhạy cảm để tránh ghi nhận đơn đặt phòng hoặc thanh toán sai.",
            "Khách sạn chịu trách nhiệm cập nhật thông tin lưu trú và house rules của mình; EnziuRooms không tự bịa quy định thay khách sạn.",
            "Khi có tranh chấp, EnziuRooms có thể đối chiếu thông tin đặt phòng, giao dịch, hoàn tiền, lịch sử xử lý và chứng từ liên quan thay vì chỉ dựa trên ảnh chụp màn hình.",
          ]} />
        </PolicySection>

        <PolicySection id="terms-change" number="10" title="Thay đổi điều khoản và phiên bản áp dụng" lead="Khi nghiệp vụ hoặc chức năng hệ thống thay đổi, EnziuRooms có thể cập nhật tài liệu để phản ánh đúng cách hệ thống hoạt động." icon={CalendarClock}>
          <p className="policy-paragraph">Các thay đổi quan trọng nên được thể hiện bằng phiên bản/cập nhật rõ ràng. Với đơn đặt phòng đã xác nhận, những điều kiện đã được chốt trong Điều kiện đặt phòng của đơn đặt phòng đó không nên bị thay thế âm thầm bằng một nội dung mới bất lợi cho Khách hàng.</p>
        </PolicySection>
      </article>
    </div>
  );
}

function PrivacyContent() {
  const toc = [
    ["privacy-principles", "Nguyên tắc xử lý"],
    ["privacy-collected", "Dữ liệu được xử lý"],
    ["privacy-purpose", "Mục đích sử dụng"],
    ["privacy-access", "Ai được truy cập"],
    ["privacy-verification", "Xác minh danh tính"],
    ["privacy-payment", "Thanh toán & tài chính"],
    ["privacy-security", "Bảo vệ dữ liệu"],
    ["privacy-retention", "Thời gian lưu"],
    ["privacy-rights", "Quyền của người dùng"],
  ];

  const dataGroups = [
    [Users, "Tài khoản", "Họ tên/thông tin hồ sơ và dữ liệu cần để định danh tài khoản, phân quyền và hỗ trợ đăng nhập."],
    [BookOpenCheck, "Đặt phòng & lưu trú", "Khách sạn, loại phòng, ngày ở, số khách, trạng thái đơn đặt phòng, nhận/trả phòng và lịch sử thao tác liên quan."],
    [CreditCard, "Thanh toán & ví", "Số tiền, phương thức, trạng thái giao dịch, lịch sử ví/hoàn tiền và dữ liệu đối soát cần thiết."],
    [Fingerprint, "Xác minh", "Dữ liệu xác minh danh tính đối tác và dữ liệu phục vụ xác minh nhận phòng trong đúng luồng nghiệp vụ tương ứng."],
    [MessageSquareText, "Tương tác", "Đánh giá, phản hồi, chat, thông báo và nội dung hỗ trợ gắn với tài khoản hoặc đơn đặt phòng."],
    [Database, "Dữ liệu vận hành", "Thông tin phiên đăng nhập, sự kiện bảo mật và dữ liệu cần thiết để vận hành, chẩn đoán sự cố."],
  ];

  return (
    <div className="policy-long-layout privacy-document-layout">
      <aside className="policy-toc">
        <small>MỤC LỤC</small>
        <strong>Chính sách bảo mật</strong>
        <nav>{toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </aside>

      <article className="policy-long-document">
        <div className="privacy-principle-hero">
          <LockKeyhole size={26} />
          <div><strong>Nguyên tắc của EnziuRooms</strong><p>Chỉ xử lý dữ liệu cho mục đích có liên quan đến việc cung cấp, bảo vệ, đối soát và cải thiện chức năng mà người dùng đang sử dụng.</p></div>
        </div>

        <PolicySection id="privacy-principles" number="01" title="Nguyên tắc xử lý dữ liệu" lead="Chính sách này ưu tiên minh bạch và giới hạn quyền truy cập theo vai trò." icon={ShieldCheck}>
          <BulletList items={[
            "Dữ liệu được xử lý theo mục đích cụ thể như tạo tài khoản, đặt phòng, thanh toán, nhận phòng, hoàn tiền hoặc hỗ trợ.",
            "Không phải mọi người dùng đều được xem cùng một dữ liệu; quyền truy cập được giới hạn theo vai trò và phạm vi công việc cần thiết.",
            "Dữ liệu nhạy cảm không nên hiển thị công khai hoặc được dùng ngoài luồng nghiệp vụ mà người dùng đã thực hiện.",
            "Mỗi chức năng chỉ nên sử dụng lượng dữ liệu cần thiết để thực hiện đúng mục đích của chức năng đó.",
          ]} />
        </PolicySection>

        <PolicySection id="privacy-collected" number="02" title="Các nhóm dữ liệu EnziuRooms có thể xử lý" lead="Mỗi nhóm phục vụ một phần khác nhau của hành trình đặt phòng." icon={Database}>
          <div className="privacy-data-grid is-document">
            {dataGroups.map(([Icon, title, body]) => (
              <article key={title}><Icon size={20} /><div><h3>{title}</h3><p>{body}</p></div></article>
            ))}
          </div>
        </PolicySection>

        <PolicySection id="privacy-purpose" number="03" title="Dữ liệu được dùng để làm gì?" lead="Mục đích sử dụng phải gắn với chức năng thực tế của hệ thống." icon={BadgeCheck}>
          <div className="privacy-purpose-table" role="table" aria-label="Mục đích sử dụng dữ liệu">
            <div className="is-head" role="row"><span>Nhóm dữ liệu</span><span>Mục đích chính</span></div>
            <div role="row"><strong>Tài khoản</strong><span>Đăng nhập, phân quyền, hiển thị hồ sơ và liên kết thao tác với đúng người dùng.</span></div>
            <div role="row"><strong>Đặt phòng</strong><span>Tìm phòng, giữ/đặt phòng, kiểm tra trạng thái, nhận/trả phòng, đánh giá và xử lý sau lưu trú.</span></div>
            <div role="row"><strong>Thanh toán</strong><span>Tạo giao dịch, xác nhận số tiền, đối soát, quản lý ví, hoàn tiền và ngăn ghi nhận trùng.</span></div>
            <div role="row"><strong>Xác minh</strong><span>xác minh danh tính đối tác hoặc xác minh tại quầy theo đúng quy trình mà hệ thống hỗ trợ.</span></div>
            <div role="row"><strong>Dữ liệu vận hành</strong><span>Chẩn đoán lỗi, phát hiện hành vi bất thường, bảo vệ hệ thống và hỗ trợ điều tra sự cố.</span></div>
          </div>
        </PolicySection>

        <PolicySection id="privacy-access" number="04" title="Ai có thể truy cập dữ liệu?" lead="Quyền truy cập được tách theo vai trò và phạm vi nghiệp vụ." icon={KeyRound}>
          <DefinitionGrid items={[
            ["Khách hàng", "Truy cập dữ liệu tài khoản, đơn đặt phòng, thanh toán, đánh giá và nội dung thuộc phạm vi của chính mình theo các chức năng được cấp."],
            ["Đối tác khách sạn", "Truy cập dữ liệu cần để vận hành khách sạn và đơn đặt phòng thuộc khách sạn mình quản lý; không có quyền mặc định với hotel khác."],
            ["Bộ phận quản trị EnziuRooms", "Truy cập chức năng quản trị cần thiết cho vận hành nền tảng, kiểm duyệt, đối soát và xử lý quy trình hệ thống."],
            ["Dịch vụ tích hợp", "Chỉ nhận dữ liệu cần thiết cho luồng được tích hợp, ví dụ tạo/xác nhận giao dịch thanh toán hoặc gửi thông báo."],
          ]} />
          <p className="policy-paragraph">Các chức năng nhạy cảm được kiểm soát bằng cơ chế xác thực và phân quyền của EnziuRooms, không chỉ dựa vào việc hiển thị hay ẩn nút trên giao diện.</p>
        </PolicySection>

        <PolicySection id="privacy-verification" number="05" title="Thông tin xác minh danh tính, CCCD và xác minh nhận phòng" lead="Dữ liệu xác minh cần được xử lý thận trọng hơn dữ liệu giao diện thông thường." icon={Fingerprint}>
          <BulletList items={[
            "Thông tin xác minh danh tính của đối tác được sử dụng để phục vụ quy trình đăng ký và xác minh tư cách đối tác trên EnziuRooms.",
            "Dữ liệu CCCD hoặc dữ liệu đọc từ QR tại quầy chỉ phục vụ bước xác minh nhận phòng theo luồng nhận phòng tương ứng.",
            "Không sử dụng hình ảnh/chi tiết giấy tờ làm nội dung công khai trên hồ sơ, đánh giá hoặc trang khách sạn.",
            "Dữ liệu xác minh chỉ nên được lưu trong thời gian cần thiết cho việc xác minh, vận hành, đối soát và giải quyết yêu cầu có liên quan.",
          ]} />
        </PolicySection>

        <PolicySection id="privacy-payment" number="06" title="Dữ liệu thanh toán, ví và hoàn tiền" lead="EnziuRooms cần lưu đủ dữ liệu để biết giao dịch nào thuộc đơn đặt phòng nào và trạng thái xử lý ra sao." icon={WalletCards}>
          <BulletList items={[
            "Lưu số tiền, phương thức, mã/tham chiếu giao dịch và trạng thái cần thiết để đối soát.",
            "Không coi ảnh chụp giao dịch hoặc nội dung do người dùng nhập tay là xác nhận thanh toán cuối cùng.",
            "Thông tin phục vụ hoàn tiền hoặc rút tiền chỉ được cung cấp cho những bên có trách nhiệm xử lý giao dịch tương ứng.",
            "Không hiển thị khóa bảo mật hoặc thông tin tích hợp nhạy cảm của cổng thanh toán cho người dùng cuối.",
          ]} />
        </PolicySection>

        <PolicySection id="privacy-security" number="07" title="Bảo vệ tài khoản và dữ liệu" lead="EnziuRooms kết hợp kiểm soát truy cập, bảo vệ hệ thống và các biện pháp an toàn tài khoản để hạn chế rủi ro." icon={LockKeyhole}>
          <div className="privacy-security-grid">
            <article><ShieldCheck size={20} /><strong>Kiểm soát quyền truy cập</strong><p>Các chức năng nhạy cảm chỉ được thực hiện sau khi hệ thống xác minh đúng tài khoản, vai trò và phạm vi dữ liệu được phép truy cập.</p></article>
            <article><KeyRound size={20} /><strong>Bảo vệ thông tin đăng nhập</strong><p>Không công khai thông tin đăng nhập, mật khẩu hoặc khóa bảo mật.</p></article>
            <article><Database size={20} /><strong>Nhật ký vận hành & đối soát</strong><p>Ghi nhận hoạt động cần thiết để truy nguyên sự cố, đồng thời hạn chế lộ thông tin nhạy cảm.</p></article>
            <article><TriangleAlert size={20} /><strong>Phản ứng sự cố</strong><p>Khi phát hiện truy cập bất thường, hệ thống có thể giới hạn thao tác để bảo vệ tài khoản và giao dịch.</p></article>
          </div>
        </PolicySection>

        <PolicySection id="privacy-retention" number="08" title="Thời gian lưu dữ liệu" lead="Không có một con số duy nhất phù hợp cho mọi loại dữ liệu." icon={Clock3}>
          <p className="policy-paragraph">Dữ liệu được lưu trong thời gian cần thiết để cung cấp dịch vụ, thực hiện nghĩa vụ giao dịch, giải quyết tranh chấp và tuân thủ pháp luật. Thời gian cụ thể phụ thuộc loại dữ liệu và mục đích xử lý; khi không còn cần thiết, EnziuRooms áp dụng biện pháp xóa hoặc hạn chế truy cập phù hợp.</p>
        </PolicySection>

        <PolicySection id="privacy-rights" number="09" title="Quyền và lựa chọn của người dùng" lead="Một số thao tác có thể tự phục vụ; một số trường hợp cần bộ phận hỗ trợ vì liên quan dữ liệu giao dịch hoặc quyền quản trị." icon={UserRoundCheck}>
          <BulletList items={[
            "Xem và cập nhật các thông tin hồ sơ mà giao diện tài khoản cho phép.",
            "Theo dõi đơn đặt phòng, giao dịch, yêu cầu hoàn tiền và các trạng thái liên quan trong phạm vi tài khoản của mình.",
            "Liên hệ hỗ trợ khi cần xử lý dữ liệu không có chức năng tự chỉnh sửa trên giao diện.",
            "Báo cáo truy cập trái phép hoặc nghi ngờ tài khoản bị chiếm quyền để hệ thống có thể kiểm tra và hạn chế rủi ro.",
          ]} />
        </PolicySection>
      </article>
    </div>
  );
}

function CancellationContent() {
  const toc = [
    ["cancel-scope", "Khi nào có thể hủy"],
    ["cancel-source", "Điều kiện nào quyết định"],
    ["cancel-process", "Cách hủy"],
    ["cancel-finance", "Hậu quả tài chính"],
    ["cancel-noshow", "Không đến nhận phòng"],
    ["cancel-hotel", "Khách sạn hủy/không thể phục vụ"],
    ["cancel-change", "Đổi ngày/đổi phòng"],
  ];

  return (
    <div className="policy-long-layout cancel-document-layout">
      <aside className="policy-toc">
        <small>MỤC LỤC</small>
        <strong>Chính sách hủy phòng</strong>
        <nav>{toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </aside>

      <article className="policy-long-document">
        <div className="cancel-key-message"><XCircle size={25} /><div><strong>Hủy đặt phòng ≠ hoàn tiền</strong><p>Hủy là thay đổi trạng thái nhu cầu lưu trú. Hoàn tiền là quy trình tài chính riêng và chỉ áp dụng nếu khoản đã thanh toán đáp ứng điều kiện hoàn.</p></div></div>

        <PolicySection id="cancel-scope" number="01" title="Khi nào Khách hàng có thể yêu cầu hủy?" lead="Khách hàng chỉ có thể thao tác với đơn đặt phòng thuộc tài khoản của mình và khi trạng thái còn cho phép." icon={CalendarClock}>
          <BulletList items={[
            "Đơn đặt phòng phải thuộc đúng tài khoản Khách hàng đang đăng nhập.",
            "Đơn đặt phòng chưa ở trạng thái đã hủy, đã nhận phòng, đã trả phòng hoặc được xử lý theo trạng thái không còn cho phép hủy.",
            "EnziuRooms xác nhận điều kiện tại thời điểm yêu cầu; việc nút Hủy còn hiển thị không bảo đảm yêu cầu sẽ được chấp nhận nếu trạng thái đơn vừa thay đổi.",
            "Nếu đơn đã tới bước nhận phòng hoặc khách sạn đã ghi nhận trạng thái đặc biệt, Khách hàng cần sử dụng luồng hỗ trợ hoặc hoàn tiền phù hợp thay vì gửi yêu cầu hủy lặp lại.",
          ]} />
        </PolicySection>

        <PolicySection id="cancel-source" number="02" title="Điều kiện hủy được xác định từ đâu?" lead="EnziuRooms phân biệt chính sách nền tảng với điều kiện riêng của từng đơn đặt phòng và khách sạn." icon={Building2}>
          <DefinitionGrid items={[
            ["Điều kiện đặt phòng", "Các điều kiện cụ thể được hiển thị trước khi Khách hàng xác nhận đơn đặt phòng; đây là nơi cần xem đầu tiên."],
            ["Loại phòng", "Có thể chứa cấu hình refundable, payment option, khoản cọc hoặc điều kiện thương mại liên quan."],
            ["Khách sạn", "Quy định như giờ nhận, trả phòng hoặc nội quy chỗ nghỉ; không phải mọi quy định đều quyết định số tiền hoàn."],
            ["EnziuRooms", "Quy định quy trình, trạng thái đơn và các điều kiện cần thiết để yêu cầu hủy được xử lý an toàn."],
          ]} />
          <div className="policy-inline-callout is-cancel"><AlertTriangle size={19} /><div><strong>Không có tỷ lệ hoàn cố định cho mọi đơn</strong><p>Nếu điều kiện của đơn hoặc loại phòng không nêu tỷ lệ hoàn theo thời hạn, EnziuRooms không áp dụng một tỷ lệ mặc định.</p></div></div>
        </PolicySection>

        <PolicySection id="cancel-process" number="03" title="Quy trình hủy đặt phòng" lead="Hệ thống cần cho Khách hàng thấy rõ đơn đặt phòng nào đang hủy và kết quả cuối cùng." icon={RotateCcw}>
          <div className="policy-step-flow is-cancel">
            <article><span>1</span><strong>Mở đơn đặt phòng</strong><p>Kiểm tra ngày ở, trạng thái, khoản đã thanh toán và điều kiện áp dụng.</p></article>
            <article><span>2</span><strong>Chọn Hủy</strong><p>Đọc cảnh báo về ảnh hưởng tài chính trước khi xác nhận thao tác.</p></article>
            <article><span>3</span><strong>Hệ thống xác nhận</strong><p>EnziuRooms kiểm tra quyền thực hiện thao tác và trạng thái booking tại thời điểm yêu cầu hủy.</p></article>
            <article><span>4</span><strong>Cập nhật trạng thái</strong><p>Chỉ khi hệ thống chấp nhận, đơn đặt phòng mới được coi là đã hủy.</p></article>
          </div>
        </PolicySection>

        <PolicySection id="cancel-finance" number="04" title="Điều gì xảy ra với tiền đã thanh toán?" lead="Hủy đặt phòng không tự động thay đổi trạng thái của mọi giao dịch." icon={CircleDollarSign}>
          <BulletList items={[
            "Nếu Khách hàng chưa thanh toán khoản nào, việc hủy chủ yếu kết thúc đơn đặt phòng và giải phóng nghĩa vụ theo trạng thái hệ thống.",
            "Nếu đã thanh toán, khoản có thể hoàn phải tuân theo chính sách và quy trình hoàn tiền riêng.",
            "Khoản do khách sạn thu trực tiếp có thể cần Đối tác khách sạn xử lý; khoản còn ở nền tảng có thể cần Bộ phận quản trị EnziuRooms/Payment flow xử lý.",
            "Khách hàng nên theo dõi trạng thái hoàn tiền thay vì coi thông báo “đã hủy” là bằng chứng tiền đã về.",
          ]} />
          <div className="policy-related-links"><Link to="/refund-policy">Xem chính sách hoàn tiền <ChevronRight size={16} /></Link></div>
        </PolicySection>

        <PolicySection id="cancel-noshow" number="05" title="Không đến nhận phòng (No-show)" lead="No-show không phải là một thao tác hủy muộn do Khách hàng tự đặt tên; đây là trạng thái nghiệp vụ riêng." icon={Clock3}>
          <p className="policy-paragraph">Khi đơn được ghi nhận là khách không đến nhận phòng, quyền yêu cầu hoàn tiền phụ thuộc điều kiện áp dụng và giao dịch đã phát sinh. Khách hàng không nên gửi lại yêu cầu hủy để cố thay đổi kết quả đã được ghi nhận theo quy trình tại khách sạn.</p>
        </PolicySection>

        <PolicySection id="cancel-hotel" number="06" title="Trường hợp khách sạn không thể tiếp tục phục vụ đơn đặt phòng" lead="Nếu vấn đề xuất phát từ phía khách sạn, cần ghi nhận nguyên nhân và xử lý qua đúng quy trình thay vì âm thầm hủy." icon={Hotel}>
          <BulletList items={[
            "Đối tác khách sạn cần cập nhật trạng thái/nguyên nhân theo chức năng hệ thống có sẵn.",
            "Khách hàng phải được thông báo khi đơn đặt phòng thay đổi đáng kể do phía khách sạn.",
            "Nếu phát sinh khoản cần hoàn, việc hoàn tiền phải dựa trên giao dịch đã thu và nguồn tiền tương ứng.",
            "Tranh chấp cần đối chiếu lịch sử đơn, thanh toán, hoàn tiền và chứng từ liên quan.",
          ]} />
        </PolicySection>

        <PolicySection id="cancel-change" number="07" title="Đổi ngày, đổi loại phòng hoặc thay đổi đơn đặt phòng" lead="Thay đổi đơn đặt phòng không mặc định được xem là hủy đơn." icon={RefreshCcw}>
          <p className="policy-paragraph">Nếu hệ thống chưa có quy trình đổi ngày/đổi phòng đầy đủ cho Khách hàng, việc thay đổi cần thực hiện theo chức năng đang hỗ trợ hoặc qua trao đổi với khách sạn. Không nên tự suy ra rằng Khách hàng có thể hủy miễn phí rồi đặt lại với cùng giá/phòng.</p>
        </PolicySection>
      </article>
    </div>
  );
}

function RefundContent({ policy }) {
  const eligible = statusList(policy);
  const toc = [
    ["refund-eligible", "Điều kiện mở yêu cầu"],
    ["refund-amount", "Số tiền có thể hoàn"],
    ["refund-process", "Quy trình xử lý"],
    ["refund-source", "Nguồn tiền & người xử lý"],
    ["refund-status", "Trạng thái refund"],
    ["refund-reject", "Từ chối / không đủ điều kiện"],
    ["refund-time", "Thời gian & đối soát"],
    ["refund-dispute", "Khiếu nại / sai lệch"],
  ];

  return (
    <div className="policy-long-layout refund-document-layout">
      <aside className="policy-toc">
        <small>MỤC LỤC</small>
        <strong>Chính sách hoàn tiền</strong>
        <nav>{toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </aside>

      <article className="policy-long-document">
        <div className="refund-eligibility is-document">
          <div><small>TRẠNG THÁI CÓ THỂ MỞ YÊU CẦU THEO CẤU HÌNH HIỆN TẠI</small><h2>{eligible}</h2><p>Đơn đặt phòng vẫn phải có khoản đã thanh toán và chưa được hoàn toàn bộ. Đủ điều kiện “gửi yêu cầu” không đồng nghĩa chắc chắn được chấp thuận hoặc được hoàn 100%.</p></div>
          <CheckCircle2 size={42} />
        </div>

        <PolicySection id="refund-eligible" number="01" title="Điều kiện để mở yêu cầu hoàn tiền" lead="EnziuRooms kiểm tra đơn đặt phòng và giao dịch trước khi Khách hàng có thể gửi yêu cầu." icon={CheckCircle2}>
          <BulletList items={[
            `Đơn phải thuộc một trong các trạng thái có thể yêu cầu hoàn tiền, hiện hiển thị: ${eligible}.`,
            "Đơn đặt phòng phải có số tiền đã được ghi nhận thanh toán; không có khoản đã trả thì không có khoản tài chính để hoàn.",
            "Đơn chưa được hoàn toàn bộ trước đó và yêu cầu mới không được tạo khoản hoàn trùng.",
            "Điều kiện hoàn của loại phòng và đơn đặt phòng vẫn được áp dụng; trạng thái đủ điều kiện gửi yêu cầu không thay thế các điều kiện này.",
          ]} />
        </PolicySection>

        <PolicySection id="refund-amount" number="02" title="Số tiền hoàn được xác định như thế nào?" lead="EnziuRooms không tự mặc định mọi yêu cầu đều hoàn 100%." icon={CircleDollarSign}>
          <BulletList items={[
            "Số tiền đã thanh toán thực tế là giới hạn tài chính ban đầu; hệ thống không hoàn nhiều hơn tổng khoản hợp lệ đã thu.",
            "Điều kiện loại phòng, điều kiện đặt phòng, nguồn tiền và kết quả xét duyệt có thể ảnh hưởng số tiền cuối cùng.",
            "Nếu một đơn có nhiều nguồn thanh toán, khoản hoàn có thể được chia theo nơi đang quản lý từng phần tiền.",
            "Tỷ lệ hoàn chỉ được áp dụng khi điều kiện của đơn hoặc loại phòng có quy định rõ.",
          ]} />
        </PolicySection>

        <PolicySection id="refund-process" number="03" title="Quy trình xử lý hoàn tiền" lead="Mỗi bước có trạng thái rõ ràng để Khách hàng theo dõi tiến độ." icon={RefreshCcw}>
          <div className="policy-step-flow is-refund">
            <article><span>1</span><strong>Khách hàng gửi yêu cầu</strong><p>Chọn đơn đủ điều kiện, cung cấp lý do và thông tin cần thiết.</p></article>
            <article><span>2</span><strong>Đối tác khách sạn xem xét</strong><p>Đối chiếu đơn đặt phòng, trạng thái lưu trú và phần trách nhiệm của khách sạn.</p></article>
            <article><span>3</span><strong>Xác định nguồn tiền</strong><p>Phân biệt tiền còn ở nền tảng, khách sạn đã thu hoặc khoản cần đối soát.</p></article>
            <article><span>4</span><strong>Thực hiện hoàn</strong><p>Bên có trách nhiệm xử lý khoản tương ứng và ghi nhận kết quả/chứng từ khi cần.</p></article>
            <article><span>5</span><strong>Hoàn tất</strong><p>Chỉ đánh dấu hoàn tất khi các phần cần hoàn đã được xử lý theo quy trình.</p></article>
          </div>
        </PolicySection>

        <PolicySection id="refund-source" number="04" title="Nguồn tiền quyết định ai chịu trách nhiệm xử lý" lead="Một đơn đặt phòng có thể liên quan nhiều khoản tiền khác nhau." icon={Landmark}>
          <div className="refund-source-grid is-document">
            <article><WalletCards size={24} /><small>ENZIUROOMS ĐANG GIỮ</small><h3>Khoản còn ở nền tảng</h3><p>Khoản thanh toán trực tuyến hoặc số dư Ví Enziu còn do nền tảng quản lý được xử lý theo quy trình tài chính của EnziuRooms.</p></article>
            <article><Banknote size={24} /><small>KHÁCH SẠN ĐÃ THU</small><h3>Khoản thu trực tiếp</h3><p>Ví dụ khoản thanh toán tại quầy do khách sạn thu; Đối tác khách sạn có trách nhiệm thực hiện hoàn theo phần mình quản lý và cung cấp bằng chứng nếu quy trình yêu cầu.</p></article>
            <article><Scale size={24} /><small>CẦN ĐỐI SOÁT</small><h3>Khoản đã giải ngân / sai lệch</h3><p>Nếu tiền không còn nằm đúng quỹ giữ ban đầu hoặc dữ liệu cần xác minh, Bộ phận quản trị EnziuRooms phải đối soát trước khi chốt kết quả.</p></article>
          </div>
        </PolicySection>

        <PolicySection id="refund-status" number="05" title="Các trạng thái Khách hàng có thể gặp" lead="Tên trạng thái có thể thay đổi theo từng giai đoạn vận hành, nhưng ý nghĩa của từng bước xử lý phải được thể hiện rõ cho khách hàng." icon={ReceiptText}>
          <div className="refund-status-timeline">
            <span>Chờ khách sạn duyệt</span><ChevronRight size={15} />
            <span>Đã duyệt - chờ xử lý</span><ChevronRight size={15} />
            <span>Đã hoàn một phần</span><ChevronRight size={15} />
            <span>Đã hoàn tất</span>
          </div>
          <p className="policy-paragraph">Nếu yêu cầu bị từ chối, trạng thái sẽ kèm lý do để Khách hàng biết vì sao quy trình không tiếp tục. “Đã duyệt” vẫn khác “tiền đã về tài khoản”.</p>
        </PolicySection>

        <PolicySection id="refund-reject" number="06" title="Khi nào yêu cầu có thể bị từ chối hoặc không mở được?" lead="Một số tình huống không tạo ra quyền hoàn tiền dù Khách hàng đã hủy đơn đặt phòng." icon={XCircle}>
          <BulletList warning items={[
            "Đơn không thuộc tài khoản người gửi hoặc trạng thái hiện tại chưa cho phép yêu cầu hoàn tiền.",
            "Không có khoản thanh toán hợp lệ để hoàn hoặc khoản đó đã được hoàn trước đó.",
            "Đơn hoặc loại phòng có điều kiện không hoàn và không có điều kiện khác làm phát sinh quyền hoàn.",
            "Thông tin yêu cầu không khớp đơn, giao dịch hoặc có dấu hiệu trùng lặp, gian lận.",
          ]} />
        </PolicySection>

        <PolicySection id="refund-time" number="07" title="Thời gian xử lý và thời điểm tiền thực sự về" lead="Thời gian hoàn tất phụ thuộc bước duyệt, nguồn tiền và kênh nhận tiền." icon={Clock3}>
          <p className="policy-paragraph">Thời gian xử lý phụ thuộc bước duyệt, nguồn tiền và kênh nhận tiền. Sau khi EnziuRooms/khách sạn ghi nhận đã thực hiện hoàn, thời gian tiền hiển thị tại tài khoản ngân hàng hoặc kênh thanh toán có thể còn phụ thuộc hệ thống bên ngoài. Vì vậy trang trạng thái nên phân biệt “đã thực hiện hoàn” và “Khách hàng đã nhận tiền” khi dữ liệu có thể xác minh.</p>
        </PolicySection>

        <PolicySection id="refund-dispute" number="08" title="Khi số tiền hoặc trạng thái hoàn tiền có sai lệch" lead="Tranh chấp được đối chiếu từ lịch sử giao dịch và chứng từ liên quan." icon={Scale}>
          <BulletList items={[
            "Chuẩn bị mã đặt phòng, thông tin giao dịch và trạng thái hoàn tiền đang hiển thị.",
            "Đối tác khách sạn hoặc bộ phận quản trị EnziuRooms đối chiếu lịch sử thanh toán, hoàn tiền, nguồn tiền và chứng từ nếu có.",
            "Không tạo yêu cầu hoàn tiền mới chỉ để sửa yêu cầu cũ khi chưa xác định nguyên nhân sai lệch.",
            "Nếu cần hỗ trợ, khách hàng có thể sử dụng Trung tâm trợ giúp hoặc liên hệ bộ phận phụ trách để được giải thích trạng thái và kiểm tra giao dịch.",
          ]} />
        </PolicySection>
      </article>
    </div>
  );
}

function PaymentContent() {
  const toc = [
    ["pay-price", "Số tiền cần thanh toán"],
    ["pay-options", "Các phương án thanh toán"],
    ["pay-online", "PayOS & Ví Enziu"],
    ["pay-deposit", "Đặt cọc & số tiền còn lại"],
    ["pay-status", "Trạng thái giao dịch"],
    ["pay-failure", "Thất bại / hủy giao dịch"],
    ["pay-security", "An toàn thanh toán"],
    ["pay-refund", "Liên hệ với hoàn tiền"],
  ];

  return (
    <div className="policy-long-layout payment-document-layout">
      <aside className="policy-toc">
        <small>MỤC LỤC</small>
        <strong>Chính sách thanh toán</strong>
        <nav>{toc.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
      </aside>

      <article className="policy-long-document">
        <div className="payment-channel-panel is-document">
          <div className="payment-channel-copy"><small>KÊNH THANH TOÁN ONLINE</small><h2>PayOS & Ví Enziu</h2><p>Thanh toán chỉ được xem là hoàn tất khi EnziuRooms nhận và ghi nhận kết quả giao dịch hợp lệ. Ảnh chụp màn hình hoặc việc đã mở cổng thanh toán không tự xác nhận đơn đặt phòng đã được thanh toán.</p></div>
          <div className="payment-channel-visual"><WalletCards size={34} /><span>Booking</span><ChevronRight size={18} /><span>Xác nhận giao dịch</span><ChevronRight size={18} /><span>Trạng thái thanh toán</span></div>
        </div>

        <PolicySection id="pay-price" number="01" title="Số tiền cần thanh toán được xác định như thế nào?" lead="Số tiền được kiểm tra lại trước khi giao dịch được tạo." icon={ReceiptText}>
          <BulletList items={[
            "Tổng tiền được xác định từ giá loại phòng và khoảng thời gian lưu trú đã xác nhận.",
            "Giá ngày thường, cuối tuần, ngày lễ hoặc ưu đãi được áp dụng theo điều kiện tại thời điểm tính.",
            "Voucher chỉ làm thay đổi tổng tiền khi hệ thống xác nhận đủ điều kiện; số tiền cuối cùng được hiển thị lại trước khi khách hàng thực hiện thanh toán.",
            "Khoản cần trả ngay phụ thuộc phương thức của loại phòng: tại khách sạn, đặt cọc hoặc thanh toán toàn bộ.",
          ]} />
        </PolicySection>

        <PolicySection id="pay-options" number="02" title="Ba nhóm phương án thanh toán" lead="Phương án nào xuất hiện phụ thuộc cấu hình loại phòng, không phải mọi phòng đều có đủ cả ba." icon={WalletCards}>
          <div className="payment-option-grid is-document">
            <article><span><Banknote size={23} /></span><h3>Thanh toán tại khách sạn</h3><p>Chỉ áp dụng khi loại phòng cho phép. Đơn vẫn hiển thị số tiền còn phải trả và trạng thái thanh toán khi nhận phòng.</p></article>
            <article><span><CircleDollarSign size={23} /></span><h3>Đặt cọc</h3><p>Khi được hỗ trợ, số tiền cần trả ngay được tính theo tỷ lệ cọc của loại phòng hoặc đơn đặt phòng, không dùng một tỷ lệ giả định chung.</p></article>
            <article><span><CreditCard size={23} /></span><h3>Thanh toán toàn bộ</h3><p>Khách hàng thanh toán toàn bộ số tiền EnziuRooms xác nhận cho đơn tại bước giao dịch.</p></article>
          </div>
        </PolicySection>

        <PolicySection id="pay-online" number="03" title="Thanh toán qua PayOS và Ví Enziu" lead="Mỗi kênh có cách xử lý riêng, nhưng kết quả cuối cùng đều phải được EnziuRooms ghi nhận vào trạng thái thanh toán của đơn đặt phòng." icon={CreditCard}>
          <DefinitionGrid items={[
            ["PayOS", "EnziuRooms tạo giao dịch theo số tiền đã xác nhận và cập nhật kết quả thanh toán vào đơn tương ứng."],
            ["Ví Enziu", "Chỉ cho phép thanh toán khi số dư khả dụng đáp ứng khoản cần trả; biến động ví được ghi nhận để đối soát."],
            ["Ghi nhận giao dịch", "Một giao dịch chỉ được ghi nhận một lần; các thông báo hoặc yêu cầu lặp không được làm tăng số tiền hay cập nhật trùng trạng thái."],
            ["Mã giao dịch", "Thông tin tham chiếu được lưu để đối chiếu đơn đặt phòng, giao dịch và hoàn tiền khi có sự cố."],
          ]} />
        </PolicySection>

        <PolicySection id="pay-deposit" number="04" title="Đặt cọc và phần tiền còn lại" lead="Khách hàng cần nhìn thấy rõ đã trả bao nhiêu, còn bao nhiêu và khi nào cần hoàn tất." icon={CircleDollarSign}>
          <BulletList items={[
            "Tỷ lệ và số tiền đặt cọc áp dụng theo loại phòng và điều kiện đã hiển thị khi đặt.",
            "Sau khi đặt cọc thành công, đơn cần hiển thị rõ số tiền đã thanh toán và số tiền còn lại.",
            "Nếu phần tiền còn lại phải được thanh toán trước khi nhận phòng, yêu cầu này phải được hiển thị rõ trước khi khách sạn xác nhận nhận phòng.",
            "Tỷ lệ cọc của đơn đã xác nhận chỉ thay đổi khi có điều kiện giao dịch tương ứng và được EnziuRooms ghi nhận.",
          ]} />
        </PolicySection>

        <PolicySection id="pay-status" number="05" title="Trạng thái nào được coi là đã thanh toán?" lead="Trạng thái giao dịch được EnziuRooms ghi nhận là căn cứ để xác định khoản thanh toán đã hoàn tất hay chưa." icon={BadgeCheck}>
          <div className="payment-status-grid">
            <article><strong>Chờ thanh toán</strong><p>Giao dịch/booking chưa ghi nhận đủ khoản cần trả.</p></article>
            <article><strong>Đang xử lý</strong><p>Kênh thanh toán đang chờ kết quả hoặc callback cần được đồng bộ.</p></article>
            <article><strong>Đã thanh toán</strong><p>EnziuRooms đã ghi nhận giao dịch hợp lệ cho khoản thanh toán tương ứng.</p></article>
            <article><strong>Thất bại / bị hủy</strong><p>Không được tính là đã thanh toán và không tự phát sinh quyền hoàn tiền.</p></article>
          </div>
        </PolicySection>

        <PolicySection id="pay-failure" number="06" title="Khi giao dịch thất bại, hết hạn hoặc chưa được xác nhận" lead="Không được giả định một giao dịch thành công chỉ vì Khách hàng đã mở QR/cổng thanh toán." icon={XCircle}>
          <BulletList items={[
            "Nếu EnziuRooms chưa nhận được xác nhận thanh toán thành công, đơn vẫn được xem là chưa thanh toán hoặc còn thiếu khoản tương ứng.",
            "Khách hàng có thể thử lại nếu đơn vẫn còn hiệu lực.",
            "Không tạo khoản hoàn cho giao dịch chưa từng được ghi nhận là đã thanh toán.",
            "Nếu tài khoản ngân hàng đã bị trừ tiền nhưng EnziuRooms chưa ghi nhận giao dịch, khách hàng nên chờ đối soát hoặc cung cấp mã giao dịch cho bộ phận hỗ trợ trước khi thực hiện thanh toán lại.",
          ]} />
        </PolicySection>

        <PolicySection id="pay-security" number="07" title="Nguyên tắc an toàn thanh toán" lead="Bảo vệ giao dịch quan trọng hơn việc làm quy trình nhanh bằng cách bỏ qua xác minh." icon={ShieldCheck}>
          <BulletList items={[
            "Không hiển thị hoặc ghi nhận công khai khóa bảo mật và thông tin tích hợp nhạy cảm của PayOS.",
            "Số tiền thanh toán được xác định từ dữ liệu đơn đặt phòng và các ưu đãi hợp lệ do hệ thống xác nhận.",
            "Kết quả từ cổng thanh toán phải được xác minh trước khi EnziuRooms cập nhật trạng thái giao dịch; giao dịch lặp không được ghi nhận nhiều lần.",
            "Khách hàng không nên chuyển tiền ngoài các phương thức được hiển thị hoặc xác nhận cho đơn đặt phòng.",
          ]} />
        </PolicySection>

        <PolicySection id="pay-refund" number="08" title="Thanh toán và hoàn tiền là hai quy trình riêng biệt" lead="Một giao dịch thành công có thể tạo khoản đủ điều kiện hoàn; một giao dịch thất bại thì không." icon={RotateCcw}>
          <p className="policy-paragraph">Khi booking bị hủy hoặc phát sinh no-show, hệ thống phải xem xét chính sách hoàn tiền, trạng thái đơn đặt phòng và nguồn tiền. Không đảo giao dịch chỉ vì booking thay đổi trạng thái.</p>
          <div className="policy-related-links"><Link to="/refund-policy">Xem chính sách hoàn tiền <ChevronRight size={16} /></Link><Link to="/cancellation-policy">Xem chính sách hủy phòng <ChevronRight size={16} /></Link></div>
        </PolicySection>
      </article>
    </div>
  );
}

function PolicyPage({ pathname, meta, policy }) {
  const Icon = meta.icon;
  let body = null;
  if (pathname === "/terms") body = <TermsContent />;
  if (pathname === "/privacy") body = <PrivacyContent />;
  if (pathname === "/cancellation-policy") body = <CancellationContent />;
  if (pathname === "/refund-policy") body = <RefundContent policy={policy} />;
  if (pathname === "/payment-policy") body = <PaymentContent />;

  return (
    <main className={`legal-info-page legal-policy-page theme-${meta.theme}`}>
      <section className="legal-policy-hero">
        <div className="container">
          <div className="legal-policy-topbar">
            <PolicyNav pathname={pathname} />
          </div>
          <div className="legal-policy-heading">
            <span className="legal-policy-icon"><Icon size={31} /></span>
            <div>
              <span className="legal-info-eyebrow">{meta.eyebrow}</span>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
              <div className="legal-policy-meta"><span>{meta.version}</span><span>{meta.updated}</span></div>
            </div>
          </div>
        </div>
      </section>
      <section className="legal-policy-body">
        <div className="container">
          {body}
          <div className="policy-closing-note"><ShieldCheck size={19} /><p><strong>Lưu ý áp dụng:</strong> Điều kiện cụ thể của từng đơn đặt phòng và quy định riêng của khách sạn được hiển thị tại trang chi tiết khách sạn và bước xác nhận đặt phòng. Trường hợp có khác biệt, điều kiện được xác nhận cho booking cụ thể là căn cứ trực tiếp để xử lý.</p></div>
        </div>
      </section>
    </main>
  );
}

function BasicPage({ content }) {
  const Icon = content.icon;
  return (
    <main className="legal-info-page">
      <section className="legal-info-hero">
        <div className="container">
          <div className="legal-info-heading"><span className="legal-info-icon"><Icon size={28} /></span><div><span className="legal-info-eyebrow">{content.eyebrow}</span><h1>{content.title}</h1><p>{content.description}</p></div></div>
        </div>
      </section>
      <section className="legal-info-content">
        <div className="container legal-info-layout">
          <div className="legal-info-sections">{content.sections.map((section) => <article key={section.title} className="legal-info-card"><h2>{section.title}</h2><ul>{section.points.map((point) => <li key={point}><CheckCircle2 size={17} /><span>{point}</span></li>)}</ul></article>)}</div>
        </div>
      </section>
    </main>
  );
}

export default function LegalInfoPage() {
  const location = useLocation();
  const [platformPolicy, setPlatformPolicy] = useState(null);
  const pathname = location.pathname;
  const policyMeta = PAGE_META[pathname];

  useEffect(() => {
    if (!policyMeta) return undefined;
    let active = true;
    getPlatformPolicy().then((data) => active && setPlatformPolicy(data)).catch(() => {});
    return () => { active = false; };
  }, [policyMeta]);

  const basicContent = useMemo(() => BASIC_CONTENT[pathname] ?? BASIC_CONTENT["/help"], [pathname]);

  if (policyMeta) {
    return <PolicyPage pathname={pathname} meta={policyMeta} policy={platformPolicy} />;
  }
  return <BasicPage content={basicContent} />;
}
