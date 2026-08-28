import {
  Award,
  Bot,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Headphones,
  LockKeyhole,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAiAssistant } from "../../ai/AiAssistantContext";
import { useAuth } from "../../auth/AuthContext";
import { getMembershipLevels } from "../../services/promotionService";
import "./HomeFutureSections.css";

const FAQ_ITEMS = [
  {
    id: "booking",
    question: "Làm thế nào để đặt phòng trên EnziuRooms?",
    answer:
      "Chọn điểm đến, ngày nhận/trả phòng và số khách, sau đó mở khách sạn phù hợp, chọn loại phòng còn khả dụng và tiếp tục tới bước xác nhận đặt phòng. Giá và tình trạng phòng được lấy từ dữ liệu hệ thống tại thời điểm bạn thao tác.",
  },
  {
    id: "payment",
    question: "Thanh toán trên EnziuRooms được xử lý như thế nào?",
    answer:
      "Các khoản cần thanh toán được hiển thị rõ trong booking. Giao dịch trực tuyến được chuyển qua luồng thanh toán của hệ thống và trạng thái thanh toán được đồng bộ về EnziuRooms để bạn theo dõi trong tài khoản.",
  },
  {
    id: "cancel",
    question: "Tôi có thể hủy phòng và yêu cầu hoàn tiền không?",
    answer:
      "Khả năng hủy và hoàn tiền phụ thuộc trạng thái booking cùng điều kiện áp dụng tại thời điểm yêu cầu. Khi đủ điều kiện, EnziuRooms cho phép theo dõi tiến trình yêu cầu hoàn tiền ngay trong hệ thống.",
  },
  {
    id: "checkin",
    question: "QR check-in dùng để làm gì?",
    answer:
      "Sau khi booking đáp ứng điều kiện nhận phòng, mã QR giúp Hotel Admin tra cứu đúng booking tại quầy, đối chiếu thông tin cần thiết và thực hiện bước nhận phòng nhanh hơn.",
  },
  {
    id: "age",
    question: "Vì sao người đại diện nhận phòng cần đủ tuổi?",
    answer:
      "EnziuRooms kiểm tra điều kiện tuổi của người đại diện booking trước các bước quan trọng và hỗ trợ Hotel Admin xác minh giấy tờ tại quầy để giảm sai sót trong quá trình nhận phòng.",
  },
  {
    id: "ai",
    question: "Enziu AI có tự tạo giá hoặc phòng trống không?",
    answer:
      "Không. Enziu AI dùng dữ liệu khách sạn, loại phòng, giá, phòng trống, ưu đãi và booking mà hệ thống cung cấp để hỗ trợ tìm kiếm và so sánh. Khi chưa có dữ liệu cần thiết, AI không nên khẳng định thay cho hệ thống.",
  },
];

function tierCondition(tier) {
  const level = Number(tier?.level);
  const threshold = Number(tier?.minCompletedBookings);

  if (level === 1 && (!Number.isFinite(threshold) || threshold <= 0)) {
    return "Quyền lợi bắt đầu từ cấp thành viên đầu tiên.";
  }

  if (Number.isFinite(threshold)) {
    return `Mở khóa từ ${threshold} booking đã hoàn tất.`;
  }

  return "Điều kiện mở khóa được quản trị trên hệ thống.";
}

function tierDiscount(tier) {
  const value = Number(tier?.discountPercent);
  return Number.isFinite(value)
    ? `Giảm ${value}% khi đặt phòng`
    : "Mức giảm được cấu hình trên hệ thống";
}

export default function HomeFutureSections() {
  const { user, isAuthenticated } = useAuth();
  const { openAssistant } = useAiAssistant();

  const [tiers, setTiers] = useState([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(FAQ_ITEMS[0].id);

  useEffect(() => {
    let active = true;

    // /membership/tiers là API dành cho phiên đã đăng nhập.
    // Trang chủ là public, vì vậy tuyệt đối không gọi endpoint này khi Guest
    // chưa đăng nhập; nếu gọi sẽ nhận 401 và apiClient sẽ đưa người dùng
    // sang /login.
    if (!isAuthenticated) {
      setTiers([]);
      setTiersLoading(false);
      return () => {
        active = false;
      };
    }

    setTiersLoading(true);

    getMembershipLevels()
      .then((items) => {
        if (!active) return;
        const normalized = Array.isArray(items) ? items : [];
        setTiers(
          [...normalized].sort(
            (left, right) => Number(left?.level ?? 0) - Number(right?.level ?? 0),
          ),
        );
      })
      .catch(() => {
        if (active) setTiers([]);
      })
      .finally(() => {
        if (active) setTiersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const normalizedRole = String(user?.role ?? "")
    .replace(/^ROLE_/i, "")
    .toUpperCase();

  const partnerAction = useMemo(() => {
    if (!isAuthenticated) {
      return {
        to: "/login",
        label: "Đăng nhập để trở thành đối tác",
        hint: "Đăng nhập trước, sau đó gửi hồ sơ đối tác trực tiếp trên EnziuRooms.",
      };
    }

    if (normalizedRole === "CUSTOMER") {
      return {
        to: "/customer/partner",
        label: "Đăng ký đối tác ngay",
        hint: "Gửi hồ sơ xác minh và theo dõi trạng thái xét duyệt trên tài khoản của bạn.",
      };
    }

    if (normalizedRole === "HOTEL_ADMIN") {
      return {
        to: "/hotel-admin/hotels",
        label: "Quản lý khách sạn",
        hint: "Tài khoản của bạn đã có quyền quản trị khách sạn trên EnziuRooms.",
      };
    }

    return {
      to: "/admin",
      label: "Mở khu vực quản trị",
      hint: "Theo dõi hoạt động đối tác và vận hành hệ thống.",
    };
  }, [isAuthenticated, normalizedRole]);

  const rewardsPath = normalizedRole === "CUSTOMER" ? "/customer/rewards" : "/login";
  const rewardsLabel = isAuthenticated ? "Xem hạng & ưu đãi" : "Đăng nhập để xem hạng & ưu đãi";

  return (
    <>
      <section className="home-section home-journey-section">
        <div className="container">
          <div className="home-section-heading home-future-heading">
            <div>
              <span className="home-section-kicker">TỪ ĐẶT PHÒNG ĐẾN NHẬN PHÒNG</span>
              <h2>Một hành trình rõ ràng trên cùng một hệ thống</h2>
              <p>
                EnziuRooms kết nối tìm kiếm, thanh toán, nhận phòng và hỗ trợ sau booking thay vì tách người dùng qua nhiều luồng rời rạc.
              </p>
            </div>
          </div>

          <div className="home-journey-grid">
            <article>
              <span><ShieldCheck size={22} /></span>
              <div>
                <h3>Thông tin minh bạch</h3>
                <p>Khách sạn, phòng, sức chứa và trạng thái được lấy từ dữ liệu thật của hệ thống.</p>
              </div>
            </article>

            <article>
              <span><CreditCard size={22} /></span>
              <div>
                <h3>Thanh toán có trạng thái</h3>
                <p>Theo dõi giao dịch và số tiền cần xử lý trực tiếp trong booking của bạn.</p>
              </div>
            </article>

            <article>
              <span><QrCode size={22} /></span>
              <div>
                <h3>QR Check-in</h3>
                <p>Tra cứu booking nhanh tại quầy và tiếp tục quy trình xác minh nhận phòng.</p>
              </div>
            </article>

            <article>
              <span><RefreshCcw size={22} /></span>
              <div>
                <h3>Theo dõi hoàn tiền</h3>
                <p>Yêu cầu hợp lệ được ghi nhận và hiển thị trạng thái xử lý trên EnziuRooms.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="home-section home-membership-section">
        <div className="container home-membership-shell">
          <div className="home-membership-intro">
            <span className="home-section-kicker">THÀNH VIÊN ENZIUROOMS</span>
            <h2>Đi nhiều hơn, mở khóa nhiều quyền lợi hơn</h2>
            <p>
              Các cấp thành viên bên cạnh được tải trực tiếp từ cấu hình membership hiện tại của EnziuRooms.
            </p>
            <Link to={rewardsPath} className="home-primary-link">
              <Award size={17} />
              {rewardsLabel}
            </Link>
          </div>

          <div className="home-tier-grid">
            {tiersLoading ? (
              <article className="home-tier-loading">
                <span className="home-tier-spinner" />
                <strong>Đang tải quyền lợi thành viên...</strong>
              </article>
            ) : tiers.length ? (
              tiers.map((tier) => (
                <article className="home-tier-card" key={tier.level ?? tier.name}>
                  <div className="home-tier-title-row">
                    <span className="home-tier-level">{tier.level ?? "•"}</span>
                    <div>
                      <small>Cấp thành viên</small>
                      <h3>{tier.name || `Cấp ${tier.level}`}</h3>
                    </div>
                  </div>
                  <strong>{tierDiscount(tier)}</strong>
                  <p>{tierCondition(tier)}</p>
                  <span className="home-tier-rule">
                    <CheckCircle2 size={16} />
                    Tự động áp dụng khi booking đủ điều kiện
                  </span>
                </article>
              ))
            ) : (
              <article className="home-tier-empty">
                <LockKeyhole size={24} />
                <div>
                  <strong>
                    {isAuthenticated
                      ? "Quyền lợi thành viên đang được cập nhật"
                      : "Đăng nhập để xem quyền lợi thành viên"}
                  </strong>
                  <p>
                    {isAuthenticated
                      ? "Không hiển thị mức giảm giả khi API chưa trả dữ liệu."
                      : "Khách chưa đăng nhập vẫn có thể xem trang chủ, tìm kiếm và khám phá khách sạn bình thường."}
                  </p>
                </div>
              </article>
            )}
          </div>
        </div>
      </section>

      <section className="home-section home-ai-showcase-section">
        <div className="container">
          <div className="home-ai-showcase">
            <div className="home-ai-copy">
              <span className="home-ai-eyebrow"><Sparkles size={16} /> ENZIU AI BOOKING AGENT</span>
              <h2>Không biết nên chọn khách sạn nào?</h2>
              <p>
                Nói nhu cầu theo cách tự nhiên. Enziu AI có thể hỗ trợ đối chiếu khách sạn, loại phòng, giá, phòng trống và ưu đãi từ dữ liệu hệ thống.
              </p>
              <ul>
                <li><CheckCircle2 size={16} /> Tìm theo nhu cầu và ngân sách</li>
                <li><CheckCircle2 size={16} /> So sánh lựa chọn dễ hiểu</li>
                <li><CheckCircle2 size={16} /> Giữ trang khách sạn ở phía sau khi chat</li>
              </ul>
              <button
                type="button"
                className="home-ai-button"
                onClick={() => openAssistant({ clearHotelContext: true })}
              >
                <Bot size={18} />
                Hỏi Enziu AI
              </button>
            </div>

            <div className="home-ai-visual" aria-hidden="true">
              <span className="home-ai-orbit home-ai-orbit-one" />
              <span className="home-ai-orbit home-ai-orbit-two" />
              <div className="home-ai-bubble home-ai-bubble-top">Bạn muốn đi đâu kỳ này?</div>
              <div className="home-ai-bot">
                <span className="home-ai-bot-ear left" />
                <span className="home-ai-bot-ear right" />
                <span className="home-ai-bot-face"><i /><i /></span>
                <Bot size={68} />
              </div>
              <div className="home-ai-bubble home-ai-bubble-bottom">Mình sẽ đối chiếu dữ liệu thật cho bạn.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-partner-section">
        <div className="container">
          <div className="home-partner-card">
            <div className="home-partner-visual" aria-hidden="true">
              <Building2 size={62} />
              <span>HOTEL</span>
            </div>

            <div className="home-partner-copy">
              <span className="home-section-kicker">DÀNH CHO ĐỐI TÁC LƯU TRÚ</span>
              <h2>Đưa khách sạn của bạn lên EnziuRooms</h2>
              <p>
                Quản lý khách sạn, loại phòng, booking, khuyến mãi, đánh giá và vận hành nhận phòng trên cùng một hệ thống.
              </p>
              <div className="home-partner-points">
                <span><CheckCircle2 size={16} /> Hồ sơ đối tác có xác minh</span>
                <span><CheckCircle2 size={16} /> Quản lý booking tập trung</span>
                <span><CheckCircle2 size={16} /> Theo dõi doanh thu & rút tiền</span>
              </div>
              <div className="home-partner-actions">
                <Link to={partnerAction.to} className="home-primary-link">
                  <Building2 size={17} />
                  {partnerAction.label}
                </Link>
                <small>{partnerAction.hint}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="home-section home-faq-section">
        <div className="container">
          <div className="home-section-heading home-future-heading">
            <div>
              <span className="home-section-kicker">TRỢ GIÚP NHANH</span>
              <h2>Câu hỏi thường gặp</h2>
              <p>Những câu hỏi người dùng thường gặp trong quá trình tìm, đặt và nhận phòng.</p>
            </div>
            <span className="home-faq-support"><Headphones size={18} /> Hỗ trợ ngay trên EnziuRooms</span>
          </div>

          <div className="home-faq-grid">
            {FAQ_ITEMS.map((item) => {
              const expanded = openFaq === item.id;
              return (
                <article className={`home-faq-item ${expanded ? "open" : ""}`} key={item.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenFaq(expanded ? "" : item.id)}
                  >
                    <span>{item.question}</span>
                    <ChevronDown size={19} />
                  </button>
                  {expanded ? <p>{item.answer}</p> : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
