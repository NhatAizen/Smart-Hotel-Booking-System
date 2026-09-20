import {
  Suspense,
  lazy,
} from "react";
import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "../auth/ProtectedRoute";
import RoleRoute from "../auth/RoleRoute";
import EnziuPageLoader from "../components/common/EnziuPageLoader";

import { AiAssistantProvider } from "../ai/AiAssistantContext";
import { FloatingChatProvider } from "../chat/FloatingChatContext";

const PublicLayout = lazy(() => import("../layouts/PublicLayout"));
const CustomerLayout = lazy(() => import("../layouts/CustomerLayout"));
const AdminLayout = lazy(() => import("../layouts/AdminLayout"));
const HotelAdminLayout = lazy(() => import("../layouts/HotelAdminLayout"));

const HomePage = lazy(() => import("../pages/shared/HomePage"));
const HotelsPage = lazy(() => import("../pages/shared/HotelsPage"));
const HotelDetailPage = lazy(() => import("../pages/shared/HotelDetailPage"));
const UnauthorizedPage = lazy(() => import("../pages/shared/UnauthorizedPage"));
const NotFoundPage = lazy(() => import("../pages/shared/NotFoundPage"));
const LegalInfoPage = lazy(() => import("../pages/shared/LegalInfoPage"));

const LoginPage = lazy(() => import("../pages/auth/LoginPage"));
const EnziuLoginPage = lazy(() => import("../pages/auth/EnziuLoginPage"));
const RegisterPage = lazy(() => import("../pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("../pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("../pages/auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("../pages/auth/VerifyEmailPage"));
const OAuth2CallbackPage = lazy(() => import("../pages/auth/OAuth2CallbackPage"));

const CustomerDashboard = lazy(() => import("../pages/customer/CustomerDashboard"));
const BookingsPage = lazy(() => import("../pages/customer/BookingsPage"));
const NotificationsPage = lazy(() => import("../pages/customer/NotificationsPage"));
const PaymentsPage = lazy(() => import("../pages/customer/PaymentsPage"));
const BookingCheckoutPage = lazy(() => import("../pages/customer/BookingCheckoutPage"));
const PaymentGatewayPage = lazy(() => import("../pages/customer/PaymentGatewayPage"));
const BookingSuccessPage = lazy(() => import("../pages/customer/BookingSuccessPage"));
const ProfilePage = lazy(() => import("../pages/customer/ProfilePage"));
const FavoritesPage = lazy(() => import("../pages/customer/FavoritesPage"));
const MyReviewsPage = lazy(() => import("../pages/customer/MyReviewsPage"));
const CustomerWalletPage = lazy(() => import("../pages/customer/CustomerWalletPage"));
const PartnerApplicationPage = lazy(() => import("../pages/customer/PartnerApplicationPage"));
const RewardsPage = lazy(() => import("../pages/customer/RewardsPage"));
const ComplaintsPage = lazy(() => import("../pages/customer/ComplaintsPage"));

const AiAssistantLegacyRoute = lazy(() => import("../components/ai/AiAssistantLegacyRoute"));
const FloatingAiAssistant = lazy(() => import("../components/ai/FloatingAiAssistant"));
const FloatingChatDock = lazy(() => import("../components/chat/FloatingChatDock"));

const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const ManageUsersPage = lazy(() => import("../pages/admin/ManageUsersPage"));
const PartnerRequestsPage = lazy(() => import("../pages/admin/PartnerRequestsPage"));
const ManageHotelsPage = lazy(() => import("../pages/admin/ManageHotelsPage"));
const ManageRoomTypesPage = lazy(() => import("../pages/admin/ManageRoomTypesPage"));
const PlatformWalletPage = lazy(() => import("../pages/admin/PlatformWalletPage"));
const SystemNotificationsPage = lazy(() => import("../pages/admin/SystemNotificationsPage"));
const MarketingPage = lazy(() => import("../pages/admin/MarketingPage"));
const AdminReviewsPage = lazy(() => import("../pages/admin/AdminReviewsPage"));
const AdminBookingsPage = lazy(() => import("../pages/admin/AdminBookingsPage"));
const AdminComplaintsPage = lazy(() => import("../pages/admin/AdminComplaintsPage"));

const HotelAdminDashboard = lazy(() => import("../pages/hotel-admin/HotelAdminDashboard"));
const MyHotelsPage = lazy(() => import("../pages/hotel-admin/MyHotelsPage"));
const CreateHotelPage = lazy(() => import("../pages/hotel-admin/CreateHotelPage"));
const RoomTypesPage = lazy(() => import("../pages/hotel-admin/RoomTypesPage"));
const ManualDailyPricingPage = lazy(() => import("../pages/hotel-admin/ManualDailyPricingPage"));
const RoomsPage = lazy(() => import("../pages/hotel-admin/RoomsPage"));
const HotelNotificationsPage = lazy(() => import("../pages/hotel-admin/HotelNotificationsPage"));
const HotelWalletPage = lazy(() => import("../pages/hotel-admin/HotelWalletPage"));
const StayManagementPage = lazy(() => import("../pages/hotel-admin/StayManagementPage"));
const LegacyStayRedirect = lazy(() => import("../pages/hotel-admin/StayManagementPage")
  .then((module) => ({ default: module.LegacyStayRedirect })));
const HotelAdminProfilePage = lazy(() => import("../pages/hotel-admin/HotelAdminProfilePage"));
const PromotionsPage = lazy(() => import("../pages/hotel-admin/PromotionsPage"));
const HotelMessagesPage = lazy(() => import("../pages/hotel-admin/HotelMessagesPage"));
const HotelReviewsPage = lazy(() => import("../pages/hotel-admin/HotelReviewsPage"));
const HotelBookingsPage = lazy(() => import("../pages/hotel-admin/HotelBookingsPage"));
const HotelPoliciesPage = lazy(() => import("../pages/hotel-admin/HotelPoliciesPage"));
const HotelComplaintsPage = lazy(() => import("../pages/hotel-admin/HotelComplaintsPage"));
const PlatformPoliciesPage = lazy(() => import("../pages/admin/PlatformPoliciesPage"));

function RouteFallback() {
  return <EnziuPageLoader label="Đang mở trang..." />;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AiAssistantProvider>
        <FloatingChatProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/hotels" element={<HotelsPage />} />
              <Route path="/hotels/:hotelId" element={<HotelDetailPage />} />
              <Route path="/about" element={<LegalInfoPage />} />
              <Route path="/help" element={<LegalInfoPage />} />
              <Route path="/terms" element={<LegalInfoPage />} />
              <Route path="/privacy" element={<LegalInfoPage />} />
              <Route path="/cancellation-policy" element={<LegalInfoPage />} />
              <Route path="/refund-policy" element={<LegalInfoPage />} />
              <Route path="/payment-policy" element={<LegalInfoPage />} />
            </Route>

            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/enziurooms" element={<EnziuLoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/oauth2/callback" element={<OAuth2CallbackPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<RoleRoute allowedRoles={["CUSTOMER", "HOTEL_ADMIN"]} />}>
                <Route path="/payment/payos/success" element={<PaymentGatewayPage />} />
                <Route path="/payment/payos/cancel" element={<PaymentGatewayPage />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={["CUSTOMER"]} />}>
                <Route element={<CustomerLayout />}>
                  <Route path="/customer" element={<CustomerDashboard />} />
                  <Route path="/customer/profile" element={<ProfilePage />} />
                  <Route path="/customer/bookings" element={<BookingsPage />} />
                  <Route path="/customer/favorites" element={<FavoritesPage />} />
                  <Route path="/customer/reviews" element={<MyReviewsPage />} />
                  <Route path="/customer/wallet" element={<CustomerWalletPage />} />
                  <Route path="/customer/partner" element={<PartnerApplicationPage />} />
                  <Route path="/customer/rewards" element={<RewardsPage />} />
                  <Route path="/customer/payments" element={<PaymentsPage />} />
                  <Route path="/customer/notifications" element={<NotificationsPage />} />
                  <Route path="/customer/complaints" element={<ComplaintsPage />} />
                  <Route path="/customer/ai" element={<AiAssistantLegacyRoute />} />
                  <Route path="/customer/ai-assistant" element={<AiAssistantLegacyRoute />} />
                </Route>

                <Route path="/customer/checkout" element={<BookingCheckoutPage />} />
                <Route path="/customer/payment" element={<PaymentGatewayPage />} />
                <Route path="/customer/booking-success" element={<BookingSuccessPage />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={["HOTEL_ADMIN"]} />}>
                <Route element={<HotelAdminLayout />}>
                  <Route path="/hotel-admin" element={<HotelAdminDashboard />} />
                  <Route path="/hotel-admin/profile" element={<HotelAdminProfilePage />} />
                  <Route path="/hotel-admin/hotels" element={<MyHotelsPage />} />
                  <Route path="/hotel-admin/hotels/create" element={<CreateHotelPage />} />
                  <Route path="/hotel-admin/room-types" element={<RoomTypesPage />} />
                  <Route path="/hotel-admin/daily-pricing" element={<ManualDailyPricingPage />} />
                  <Route path="/hotel-admin/rooms" element={<RoomsPage />} />
                  <Route path="/hotel-admin/notifications" element={<HotelNotificationsPage />} />
                  <Route path="/hotel-admin/wallet" element={<HotelWalletPage />} />
                  <Route path="/hotel-admin/stays" element={<StayManagementPage />} />
                  <Route path="/hotel-admin/check-in" element={<LegacyStayRedirect tab="check-in" />} />
                  <Route path="/hotel-admin/current-stays" element={<LegacyStayRedirect tab="check-out" />} />
                  <Route path="/hotel-admin/bookings" element={<HotelBookingsPage />} />
                  <Route path="/hotel-admin/promotions" element={<PromotionsPage />} />
                  <Route path="/hotel-admin/messages" element={<HotelMessagesPage />} />
                  <Route path="/hotel-admin/reviews" element={<HotelReviewsPage />} />
                  <Route path="/hotel-admin/policies" element={<HotelPoliciesPage />} />
                  <Route path="/hotel-admin/complaints" element={<HotelComplaintsPage />} />
                </Route>
              </Route>

              <Route element={<RoleRoute allowedRoles={["SYSTEM_ADMIN"]} />}>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route
                    path="/admin/explore-hotels"
                    element={(
                      <HotelsPage
                        browseBasePath="/admin/explore-hotels"
                        browseHomePath="/admin"
                        browseHomeLabel="Tổng quan"
                      />
                    )}
                  />
                  <Route
                    path="/admin/explore-hotels/:hotelId"
                    element={<HotelDetailPage browseBasePath="/admin/explore-hotels" />}
                  />
                  <Route path="/admin/users" element={<ManageUsersPage />} />
                  <Route path="/admin/partner-requests" element={<PartnerRequestsPage />} />
                  <Route path="/admin/hotels" element={<ManageHotelsPage />} />
                  <Route path="/admin/room-types" element={<ManageRoomTypesPage />} />
                  <Route path="/admin/wallet" element={<PlatformWalletPage />} />
                  <Route path="/admin/notifications" element={<SystemNotificationsPage />} />
                  <Route path="/admin/marketing" element={<MarketingPage />} />
                  <Route path="/admin/reviews" element={<AdminReviewsPage />} />
                  <Route path="/admin/bookings" element={<AdminBookingsPage />} />
                  <Route path="/admin/policies" element={<PlatformPoliciesPage />} />
                  <Route path="/admin/complaints" element={<AdminComplaintsPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>

          <Suspense fallback={null}>
            <FloatingAiAssistant />
            <FloatingChatDock />
          </Suspense>
        </FloatingChatProvider>
      </AiAssistantProvider>
    </BrowserRouter>
  );
}
