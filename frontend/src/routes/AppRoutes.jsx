import {
  BrowserRouter,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "../auth/ProtectedRoute";
import RoleRoute from "../auth/RoleRoute";

import PublicLayout from "../layouts/PublicLayout";
import CustomerLayout from "../layouts/CustomerLayout";
import AdminLayout from "../layouts/AdminLayout";
import HotelAdminLayout from "../layouts/HotelAdminLayout";

import HomePage from "../pages/shared/HomePage";
import HotelsPage from "../pages/shared/HotelsPage";
import HotelDetailPage from "../pages/shared/HotelDetailPage";
import UnauthorizedPage from "../pages/shared/UnauthorizedPage";
import NotFoundPage from "../pages/shared/NotFoundPage";

import LoginPage from "../pages/auth/LoginPage";
import RegisterPage from "../pages/auth/RegisterPage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "../pages/auth/ResetPasswordPage";
import VerifyEmailPage from "../pages/auth/VerifyEmailPage";
import OAuth2CallbackPage from "../pages/auth/OAuth2CallbackPage";

import CustomerDashboard from "../pages/customer/CustomerDashboard";
import BookingsPage from "../pages/customer/BookingsPage";
import NotificationsPage from "../pages/customer/NotificationsPage";
import PaymentsPage from "../pages/customer/PaymentsPage";
import BookingCheckoutPage from "../pages/customer/BookingCheckoutPage";
import PaymentGatewayPage from "../pages/customer/PaymentGatewayPage";
import BookingSuccessPage from "../pages/customer/BookingSuccessPage";
import ProfilePage from "../pages/customer/ProfilePage";
import FavoritesPage from "../pages/customer/FavoritesPage";
import MyReviewsPage from "../pages/customer/MyReviewsPage";
import CustomerWalletPage from "../pages/customer/CustomerWalletPage";
import PartnerApplicationPage from "../pages/customer/PartnerApplicationPage";
import RewardsPage from "../pages/customer/RewardsPage";

import { AiAssistantProvider } from "../ai/AiAssistantContext";
import FloatingAiAssistant from "../components/ai/FloatingAiAssistant";
import AiAssistantLegacyRoute from "../components/ai/AiAssistantLegacyRoute";

import AdminDashboard from "../pages/admin/AdminDashboard";
import ManageUsersPage from "../pages/admin/ManageUsersPage";
import PartnerRequestsPage from "../pages/admin/PartnerRequestsPage";
import ManageHotelsPage from "../pages/admin/ManageHotelsPage";
import ManageRoomTypesPage from "../pages/admin/ManageRoomTypesPage";
import PlatformWalletPage from "../pages/admin/PlatformWalletPage";
import SystemNotificationsPage from "../pages/admin/SystemNotificationsPage";
import MarketingPage from "../pages/admin/MarketingPage";

import HotelAdminDashboard from "../pages/hotel-admin/HotelAdminDashboard";
import MyHotelsPage from "../pages/hotel-admin/MyHotelsPage";
import CreateHotelPage from "../pages/hotel-admin/CreateHotelPage";
import RoomTypesPage from "../pages/hotel-admin/RoomTypesPage";
import RoomsPage from "../pages/hotel-admin/RoomsPage";
import HotelNotificationsPage from "../pages/hotel-admin/HotelNotificationsPage";
import HotelWalletPage from "../pages/hotel-admin/HotelWalletPage";
import CheckInPage from "../pages/hotel-admin/CheckInPage";
import CurrentStaysPage from "../pages/hotel-admin/CurrentStaysPage";
import HotelAdminProfilePage from "../pages/hotel-admin/HotelAdminProfilePage";
import PromotionsPage from "../pages/hotel-admin/PromotionsPage";
import HotelMessagesPage from "../pages/hotel-admin/HotelMessagesPage";

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <AiAssistantProvider>
        <Routes>
        <Route element={<PublicLayout />}>
          <Route
            path="/"
            element={<HomePage />}
          />

          <Route
            path="/hotels"
            element={<HotelsPage />}
          />

          <Route
            path="/hotels/:hotelId"
            element={<HotelDetailPage />}
          />
        </Route>

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/register"
          element={<RegisterPage />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPasswordPage />}
        />

        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />

        <Route
          path="/verify-email"
          element={<VerifyEmailPage />}
        />

        <Route
          path="/oauth2/callback"
          element={<OAuth2CallbackPage />}
        />

        <Route
          path="/unauthorized"
          element={<UnauthorizedPage />}
        />

        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <RoleRoute
                allowedRoles={["CUSTOMER", "HOTEL_ADMIN"]}
              />
            }
          >
            <Route
              path="/payment/payos/success"
              element={<PaymentGatewayPage />}
            />

            <Route
              path="/payment/payos/cancel"
              element={<PaymentGatewayPage />}
            />
          </Route>

          <Route
            element={
              <RoleRoute
                allowedRoles={["CUSTOMER"]}
              />
            }
          >
            <Route element={<CustomerLayout />}>
              <Route
                path="/customer"
                element={<CustomerDashboard />}
              />

              <Route
                path="/customer/profile"
                element={<ProfilePage />}
              />

              <Route
                path="/customer/bookings"
                element={<BookingsPage />}
              />

              <Route
                path="/customer/favorites"
                element={<FavoritesPage />}
              />

              <Route
                path="/customer/reviews"
                element={<MyReviewsPage />}
              />

              <Route
                path="/customer/wallet"
                element={<CustomerWalletPage />}
              />

              <Route path="/customer/partner" element={<PartnerApplicationPage />} />
              <Route path="/customer/rewards" element={<RewardsPage />} />

              <Route
                path="/customer/payments"
                element={<PaymentsPage />}
              />

              <Route
                path="/customer/notifications"
                element={<NotificationsPage />}
              />

              <Route
                path="/customer/ai"
                element={<AiAssistantLegacyRoute />}
              />

              <Route
                path="/customer/ai-assistant"
                element={<AiAssistantLegacyRoute />}
              />
            </Route>

            <Route
              path="/customer/checkout"
              element={<BookingCheckoutPage />}
            />

            <Route
              path="/customer/payment"
              element={<PaymentGatewayPage />}
            />

            <Route
              path="/customer/booking-success"
              element={<BookingSuccessPage />}
            />
          </Route>

          <Route
            element={
              <RoleRoute
                allowedRoles={["HOTEL_ADMIN"]}
              />
            }
          >
            <Route element={<HotelAdminLayout />}>
              <Route
                path="/hotel-admin"
                element={<HotelAdminDashboard />}
              />

              <Route
                path="/hotel-admin/profile"
                element={<HotelAdminProfilePage />}
              />

              <Route
                path="/hotel-admin/hotels"
                element={<MyHotelsPage />}
              />

              <Route
                path="/hotel-admin/hotels/create"
                element={<CreateHotelPage />}
              />

              <Route
                path="/hotel-admin/room-types"
                element={<RoomTypesPage />}
              />

              <Route
                path="/hotel-admin/rooms"
                element={<RoomsPage />}
              />

              <Route
                path="/hotel-admin/notifications"
                element={<HotelNotificationsPage />}
              />

              <Route
                path="/hotel-admin/wallet"
                element={<HotelWalletPage />}
              />

              <Route
                path="/hotel-admin/check-in"
                element={<CheckInPage />}
              />

              <Route path="/hotel-admin/current-stays" element={<CurrentStaysPage />} />
              <Route path="/hotel-admin/promotions" element={<PromotionsPage />} />
              <Route path="/hotel-admin/messages" element={<HotelMessagesPage />} />
            </Route>
          </Route>

          <Route
            element={
              <RoleRoute
                allowedRoles={["SYSTEM_ADMIN"]}
              />
            }
          >
            <Route element={<AdminLayout />}>
              <Route
                path="/admin"
                element={<AdminDashboard />}
              />


              <Route
                path="/admin/users"
                element={<ManageUsersPage />}
              />

              <Route
                path="/admin/partner-requests"
                element={<PartnerRequestsPage />}
              />

              <Route
                path="/admin/hotels"
                element={<ManageHotelsPage />}
              />

              <Route
                path="/admin/room-types"
                element={<ManageRoomTypesPage />}
              />

              <Route
                path="/admin/wallet"
                element={<PlatformWalletPage />}
              />

              <Route path="/admin/notifications" element={<SystemNotificationsPage />} />
              <Route path="/admin/marketing" element={<MarketingPage />} />

            </Route>
          </Route>
        </Route>

        <Route
          path="*"
          element={<NotFoundPage />}
        />
        </Routes>
        <FloatingAiAssistant />
      </AiAssistantProvider>
    </BrowserRouter>
  );
}