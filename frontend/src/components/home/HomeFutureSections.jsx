import {
  ArrowRight,
  Award,
  Bot,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Headphones,
  LockKeyhole,
  QrCode,
  RefreshCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import { getMembershipLevels } from "../../services/promotionService";
import { EnziuConstellation, EnziuJourneyLine, EnziuOrbitMark } from "./EnziuSignatureVisuals";
import "./HomeFutureSections.css";

const JOURNEY_STEPS = [
  { icon: Search, index: "01", title: "Tìm đúng nhịp", text: "Khám phá khách sạn và loại phòng phù hợp với kế hoạch của bạn." },
  { icon: CreditCard, index: "02", title: "Đặt phòng gọn gàng", text: "Xem giá, chọn cách thanh toán và theo dõi đơn đặt phòng dễ dàng." },
  { icon: QrCode, index: "03", title: "Chạm để check-in", text: "Dùng mã QR để việc nhận phòng tại khách sạn nhanh gọn hơn." },
  { icon: RefreshCcw, index: "04", title: "An tâm sau chuyến", text: "Theo dõi yêu cầu hoàn tiền và tiến trình xử lý ngay trong tài khoản." },
];

const FAQ_ITEMS = [
  { id: "booking", question: "Làm thế nào để đặt phòng trên EnziuRooms?", answer: "Chọn điểm đến, ngày nhận và trả phòng, số khách, sau đó xem khách sạn phù hợp và chọn phòng còn trống. Giá và tình trạng phòng được cập nhật khi bạn tìm kiếm." },
  { id: "payment", question: "Thanh toán được xử lý như thế nào?", answer: "Số tiền cần thanh toán được hiển thị rõ trước khi bạn xác nhận. Sau khi thanh toán, bạn có thể xem lại trạng thái và chi tiết giao dịch trong đơn đặt phòng." },
  { id: "cancel", question: "Tôi có thể hủy phòng và yêu cầu hoàn tiền không?", answer: "Khả năng hủy và hoàn tiền phụ thuộc vào điều kiện của đơn đặt phòng. Nếu đủ điều kiện, bạn có thể gửi yêu cầu và theo dõi tiến trình xử lý trong tài khoản." },
  { id: "checkin", question: "QR check-in dùng để làm gì?", answer: "Khi đến khách sạn, mã QR giúp nhân viên nhanh chóng tìm đơn đặt phòng của bạn và tiếp tục các bước nhận phòng." },
  { id: "ai", question: "Enziu AI có thể giúp tôi những gì?", answer: "Enziu AI giúp bạn tìm nơi ở theo nhu cầu, ngân sách và sở thích, đồng thời hỗ trợ so sánh các lựa chọn. Thông tin về giá và phòng trống vẫn được hiển thị tại bước tìm kiếm và đặt phòng." },
];

function tierCondition(tier) {
  const level = Number(tier?.level);
  const threshold = Number(tier?.minCompletedBookings);
  if (level === 1 && (!Number.isFinite(threshold) || threshold <= 0)) return "Quyền lợi bắt đầu từ cấp thành viên đầu tiên.";
  if (Number.isFinite(threshold)) return `Mở khóa từ ${threshold} đơn đặt phòng đã hoàn tất.`;
  return "Xem chi tiết điều kiện của hạng thành viên.";
}

function tierDiscount(tier) {
  const value = Number(tier?.discountPercent);
  return Number.isFinite(value) ? `Giảm ${value}% khi đặt phòng` : "Ưu đãi theo hạng thành viên";
}

export default function HomeFutureSections() {
  const { user, isAuthenticated } = useAuth();
  const { openAssistant } = useAiAssistant();
  const [tiers, setTiers] = useState([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(FAQ_ITEMS[0].id);

  const normalizedRole = String(user?.role ?? "").replace(/^ROLE_/i, "").toUpperCase();
  const isCustomer = isAuthenticated && normalizedRole === "CUSTOMER";

  useEffect(() => {
    let active = true;
    // Membership là endpoint private: guest không được gọi để tránh lỗi 401 và redirect login.
    if (!isAuthenticated) {
      setTiers([]);
      setTiersLoading(false);
      return () => { active = false; };
    }
    setTiersLoading(true);
    getMembershipLevels()
      .then((items) => {
        if (!active) return;
        setTiers([...(Array.isArray(items) ? items : [])]
          .sort((left, right) => Number(left?.level ?? 0) - Number(right?.level ?? 0)));
      })
      .catch(() => { if (active) setTiers([]); })
      .finally(() => { if (active) setTiersLoading(false); });
    return () => { active = false; };
  }, [isAuthenticated]);

  const partnerAction = useMemo(() => {
    if (!isAuthenticated) return { to: "/login", label: "Đăng nhập để bắt đầu", hint: "Đăng nhập trước, sau đó gửi hồ sơ đối tác trên EnziuRooms." };
    if (normalizedRole === "CUSTOMER") return { to: "/customer/partner", label: "Trở thành đối tác", hint: "Gửi hồ sơ xác minh và theo dõi trạng thái xét duyệt." };
    if (normalizedRole === "HOTEL_ADMIN") return { to: "/hotel-admin/hotels", label: "Quản lý khách sạn", hint: "Đi đến khu vực quản lý nơi ở của bạn." };
    return { to: "/admin", label: "Mở khu vực quản trị", hint: "Theo dõi hoạt động và các yêu cầu đối tác." };
  }, [isAuthenticated, normalizedRole]);

  const rewardsPath = isCustomer ? "/customer/rewards" : "/login";
  const aiAction = isCustomer
    ? { type: "button", label: "Bắt đầu trò chuyện" }
    : { type: "link", to: isAuthenticated ? (normalizedRole === "HOTEL_ADMIN" ? "/hotel-admin" : "/admin") : "/login", label: isAuthenticated ? "Về khu vực của bạn" : "Đăng nhập để hỏi Enziu AI" };

  return (
    <>
      <section className="enziu-section enziu-journey-section">
        <div className="enziu-fullbleed-inner">
          <div className="enziu-section-heading">
            <div><span className="enziu-eyebrow"><i /> Hành trình cùng EnziuRooms</span><h2>Một hành trình, không đứt nhịp.</h2></div>
            <p>Từ lúc bắt đầu tìm kiếm đến khi kết thúc chuyến đi, EnziuRooms giúp bạn theo dõi mọi bước thuận tiện hơn.</p>
          </div>
          <div className="enziu-journey-map">
            <EnziuJourneyLine className="enziu-journey-svg" />
            {JOURNEY_STEPS.map(({ icon: Icon, index, title, text }) => (
              <article className="enziu-journey-step" key={index}>
                <span className="enziu-journey-node"><Icon size={21} /></span>
                <small>{index}</small><h3>{title}</h3><p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="enziu-section enziu-membership-section">
        <div className="enziu-fullbleed-inner enziu-membership-layout">
          <div className="enziu-membership-intro">
            <EnziuOrbitMark className="enziu-membership-mark" />
            <span className="enziu-eyebrow"><i /> Quyền lợi thành viên</span>
            <h2>Mỗi chuyến đi, thêm một quyền lợi.</h2>
            <p>Tích lũy qua những chuyến đi và mở khóa thêm ưu đãi dành riêng cho thành viên.</p>
            <Link to={rewardsPath} className="enziu-button enziu-button-dark"><Award size={17} /> {isCustomer ? "Xem hạng của tôi" : "Đăng nhập để xem hạng"}</Link>
          </div>
          <div className="enziu-tier-stack">
            {tiersLoading ? (
              <div className="enziu-tier-status" role="status"><span /> Đang tải quyền lợi...</div>
            ) : tiers.length ? tiers.map((tier, index) => (
              <article className="enziu-tier-card" key={tier.level ?? tier.name} style={{ "--tier-index": index }}>
                <div className="enziu-tier-top"><span className="enziu-tier-number">{String(tier.level ?? index + 1).padStart(2, "0")}</span><div><small>Cấp thành viên</small><h3>{tier.name || `Cấp ${tier.level}`}</h3></div></div>
                <strong>{tierDiscount(tier)}</strong><p>{tierCondition(tier)}</p>
                <span className="enziu-tier-rule"><Check size={15} /> Tự động áp dụng khi đủ điều kiện</span>
              </article>
            )) : (
              <div className="enziu-tier-empty"><LockKeyhole size={24} /><div><strong>{isAuthenticated ? "Quyền lợi đang được cập nhật" : "Quyền lợi dành cho tài khoản thành viên"}</strong><p>{isAuthenticated ? "Quyền lợi của bạn sẽ xuất hiện tại đây khi được cập nhật." : "Đăng nhập để xem hạng thành viên và những quyền lợi dành cho bạn."}</p></div></div>
            )}
          </div>
        </div>
      </section>

      <section className="enziu-section enziu-ai-section">
        <div className="enziu-fullbleed-inner"><div className="enziu-ai-card">
          <div className="enziu-ai-copy">
            <span className="enziu-eyebrow"><i /> Trợ lý Enziu AI</span>
            <h2>Một người bạn biết lắng nghe cách bạn muốn đi.</h2>
            <p>Chỉ cần nói bạn muốn đi đâu, thích không gian thế nào hoặc có ngân sách bao nhiêu — Enziu AI sẽ giúp bạn thu hẹp lựa chọn nhanh hơn.</p>
            <ul><li><Check size={16} /> Tìm theo nhu cầu và ngân sách</li><li><Check size={16} /> So sánh lựa chọn dễ hiểu</li><li><Check size={16} /> Giữ hành trình tìm kiếm liền mạch</li></ul>
            {aiAction.type === "button" ? (
              <button type="button" className="enziu-button enziu-button-ai" onClick={() => openAssistant({ clearHotelContext: true })}><Bot size={18} /> {aiAction.label}</button>
            ) : (
              <Link to={aiAction.to} className="enziu-button enziu-button-ai"><Bot size={18} /> {aiAction.label}</Link>
            )}
          </div>
          <div className="enziu-ai-visual" aria-hidden="true"><EnziuConstellation className="enziu-ai-constellation" /><span className="enziu-ai-core"><Sparkles size={35} /></span><span className="enziu-ai-message enziu-ai-message-one">Đi biển hay lên núi?</span><span className="enziu-ai-message enziu-ai-message-two">Để Enziu gợi ý cho bạn.</span></div>
        </div></div>
      </section>

      <section className="enziu-section enziu-partner-section">
        <div className="enziu-fullbleed-inner"><div className="enziu-partner-card">
          <div className="enziu-partner-symbol"><Building2 size={46} /><span>ENZ / PARTNER</span></div>
          <div className="enziu-partner-copy"><span className="enziu-eyebrow"><i /> Dành cho đối tác lưu trú</span><h2>Để nơi ở của bạn trở thành một phần của bản đồ Enziu.</h2><p>Quản lý nơi ở, phòng, đơn đặt, khuyến mãi, đánh giá và hoạt động nhận phòng ở một nơi.</p></div>
          <div className="enziu-partner-action"><Link to={partnerAction.to} className="enziu-button enziu-button-primary">{partnerAction.label} <ArrowRight size={17} /></Link><small>{partnerAction.hint}</small></div>
        </div></div>
      </section>

      <section id="faq" className="enziu-section enziu-faq-section">
        <div className="enziu-fullbleed-inner enziu-faq-layout">
          <div className="enziu-faq-intro"><span className="enziu-eyebrow"><i /> Trợ giúp nhanh</span><h2>Rõ ràng trước khi bạn lên đường.</h2><p>Thông tin cơ bản về tìm kiếm, thanh toán, check-in và Enziu AI.</p><span className="enziu-faq-support"><Headphones size={17} /> Hỗ trợ trên EnziuRooms</span></div>
          <div className="enziu-faq-list">
            {FAQ_ITEMS.map((item, index) => {
              const expanded = openFaq === item.id;
              return <article className={`enziu-faq-item ${expanded ? "is-open" : ""}`} key={item.id}><button type="button" aria-expanded={expanded} onClick={() => setOpenFaq(expanded ? "" : item.id)}><small>0{index + 1}</small><span>{item.question}</span><ChevronDown size={19} /></button>{expanded ? <p>{item.answer}</p> : null}</article>;
            })}
          </div>
        </div>
      </section>
    </>
  );
}
