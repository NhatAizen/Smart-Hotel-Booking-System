import { lazy, Suspense } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { DoorOpen, LogOut, ScanLine } from "lucide-react";
import { PageHeader } from "../../components/ui";
import Loading from "../../components/common/Loading";
import { stayManagementUrl } from "./stayManagementNavigation";
import "./StayManagementPage.css";

const CheckInPage = lazy(() => import("./CheckInPage"));
const CurrentStaysPage = lazy(() => import("./CurrentStaysPage"));

export function LegacyStayRedirect({ tab }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={stayManagementUrl(tab, search, hash)} />;
}

export default function StayManagementPage() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "check-out" ? "check-out" : "check-in";

  return (
    <div className="stay-management-page">
      <PageHeader
        title="Quản lý check-in và check-out"
        description="Làm thủ tục nhận phòng, theo dõi khách lưu trú và xác nhận trả phòng."
        icon={<DoorOpen size={22} />}
      />
      <nav className="stay-management-nav" aria-label="Nhận phòng và trả phòng">
        <Link to={stayManagementUrl()} aria-current={activeTab === "check-in" ? "page" : undefined}>
          <ScanLine size={20} aria-hidden="true" />
          <span><strong>Nhận phòng</strong><small>Quét QR hoặc nhập mã</small></span>
        </Link>
        <Link to={stayManagementUrl("check-out")} aria-current={activeTab === "check-out" ? "page" : undefined}>
          <LogOut size={20} aria-hidden="true" />
          <span><strong>Trả phòng</strong><small>Khách đang lưu trú</small></span>
        </Link>
      </nav>
      <Suspense fallback={<Loading message={activeTab === "check-in" ? "Đang tải quầy nhận phòng…" : "Đang tải khách lưu trú…"} />}>
        {activeTab === "check-in" ? <CheckInPage embedded /> : <CurrentStaysPage embedded />}
      </Suspense>
    </div>
  );
}
