import "./globals.css";
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { PartsListProvider } from "./contexts/PartsListContext";
import {
  AppPage,
  getDefaultPageByRole,
  getPagesByRole,
  isPageAllowedForRole,
} from "./utils/roleAccess";
import ErrorBoundary from "./components/ErrorBoundary";
import SystemNavbar from "./components/SystemNavbar";
import AIChatModal from "./components/AIChatModal";
import AdminChatbot from "./components/AdminChatbot";
import DatabaseStatus from "./components/DatabaseStatus";
import AccessDenied from "./components/AccessDenied";
import Dashboard from "./pages/Dashboard";
import InventoryPage from "./pages/InventoryPage";
import AppointmentCalendarPage from "./pages/AppointmentCalendarPage";

import CustomersListPage from "./pages/CustomersListPage";
import MechanicPortal from "./pages/MechanicPortal";
import MechanicDashboard from "./pages/MechanicDashboard";
import AdminServicesPage from "./pages/AdminServicesPage";
import BrowsePartsPage from "./pages/BrowsePartsPage";

import SettingsPage from "./pages/SettingsPage";
import AdminMechanicAvailability from "./pages/AdminMechanicAvailability";
import LoginPage from "./pages/LoginPage";
import MechanicLoginPage from "./pages/MechanicLoginPage";
import OwnerLoginPage from "./pages/OwnerLoginPage";
import LoginChoicePage from "./pages/LoginChoicePage";
import UpdatePartsPage from "./pages/UpdatePartsPage";

// Landing page imports (original)
import MotolinkLanding from "./pages/MotolinkLanding";
import BookAppointmentModal from "./components/BookAppointmentModal";
import ViewAppointmentsModal from "./components/ViewAppointmentsModal";
import BrowsePartsModal from "./components/BrowsePartsModal";
import ReceiptModal from "./components/ReceiptModal";
import CustomerPortalModal from "./components/CustomerPortalModal";
import CustomerSettingsModal from "./components/CustomerSettingsModal";
import ServiceHistoryModal from "./components/ServiceHistoryModal";
import { ShopSearchResult } from "./types/shop";

type PageType = AppPage;

type LoginType =
  | "landing"
  | "choice"
  | "customer"
  | "customer-signup"
  | "mechanic"
  | "owner";

const AppContent: React.FC = () => {
  const { isAuthenticated, user, isLoading } = useAuth();

  // Initialize currentPage from localStorage, falling back to landing
  const [currentPage, setCurrentPage] = useState<AppPage>(() => {
    const savedPage = localStorage.getItem("moto_last_page") as AppPage;
    return savedPage || "landing";
  });
  const [currentLoginType, setCurrentLoginType] =
    useState<LoginType>("landing");
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showAppointmentsModal, setShowAppointmentsModal] = useState(false);
  const [showPartsModal, setShowPartsModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState<string | undefined>(
    () => localStorage.getItem("motolink_selected_shop_id") || undefined,
  );

  const selectShop = (shop: ShopSearchResult) => {
    localStorage.setItem("motolink_selected_shop_id", shop.id);
    setSelectedShopId(shop.id);
  };

  /**
   * Wrapper around setCurrentPage that persists to localStorage
   * Use this instead of setCurrentPage directly to ensure page navigation is persisted
   */
  const navigateTo = (page: AppPage) => {
    localStorage.setItem("moto_last_page", page);
    setCurrentPage(page);
  };

  /**
   * Validate that the current page is still allowed for the user's role
   * This runs after auth is fully loaded to ensure we don't show unauthorized pages
   */
  useEffect(() => {
    // Only validate once auth is loaded and user role is available
    if (isLoading) return;

    // If not authenticated, clear any persisted page and force landing
    if (!isAuthenticated) {
      localStorage.removeItem("moto_last_page");
      setCurrentPage("landing");
      return;
    }

    // If user has no role yet, don't validate (still loading)
    if (!user?.role) return;

    // Check if the current page is allowed for this user's role
    if (
      !isPageAllowedForRole(currentPage, user.role) &&
      currentPage !== "landing"
    ) {
      console.log(
        `⚠️ [App] Current page '${currentPage}' not allowed for role '${user.role}', redirecting to '${getDefaultPageByRole(user.role)}'`,
      );
      // Clear the invalid persisted page
      localStorage.removeItem("moto_last_page");
      // Redirect to the default page for this role
      navigateTo(getDefaultPageByRole(user.role));
    }
  }, [isLoading, isAuthenticated, user?.role, currentPage]);

  // Handle page changes with role validation
  const handlePageChange = (page: AppPage | string) => {
    const newPage = page as AppPage;

    if (!isAuthenticated) {
      navigateTo("landing");
      return;
    }

    if (!user?.role) {
      navigateTo("dashboard");
      return;
    }

    if (!isPageAllowedForRole(newPage, user.role)) {
      const fallbackPage = getDefaultPageByRole(user.role);
      navigateTo(fallbackPage);
      return;
    }

    navigateTo(newPage);
  };

  // Reset page to landing when user logs out - use useEffect to avoid render conflicts
  useEffect(() => {
    if (!isAuthenticated) {
      console.log("🚪 User logged out, resetting to landing");
      localStorage.removeItem("moto_last_page");
      setCurrentPage("landing");
      setCurrentLoginType("landing");
    }
  }, [isAuthenticated]);

  // Ensure the current page is valid for the current role whenever auth / role / page changes
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!user?.role) return;

    const allowedPages = getPagesByRole(user.role);
    const defaultPage = getDefaultPageByRole(user.role);

    // Customers are allowed on the landing page (their default)
    if (user.role === "customer" && currentPage === "landing") return;

    // Non-customers on landing should go to their default page
    if (user.role !== "customer" && currentPage === "landing") {
      navigateTo(defaultPage);
      return;
    }

    if (!allowedPages.includes(currentPage)) {
      navigateTo(defaultPage);
    }
  }, [isAuthenticated, user?.role, currentPage]);

  // If auth loading, show a spinner placeholder
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] text-white">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">
            Checking authentication and role permissions...
          </p>
          <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  // If not authenticated, show landing page or login
  if (!isAuthenticated) {
    const handleLoginSuccess = () => {
      // Customers go to the splash/landing page
      // Mechanics/owners go to their default dashboard via the role validation useEffect
      navigateTo("landing");
      if (localStorage.getItem("motolink_selected_shop_id")) {
        setShowBookingModal(true);
      }
    };

    const handleOpenLogin = () => {
      setCurrentLoginType("choice");
    };

    return (
      <div className="min-h-screen bg-moto-dark overflow-x-hidden">
        <DatabaseStatus />
        {currentLoginType === "landing" ? (
          <MotolinkLanding
            isAuthenticated={false}
            onLoginRequired={(shop) => {
              if (shop) selectShop(shop);
              handleOpenLogin();
            }}
            onBook={() => handleOpenLogin()}
          />
        ) : currentLoginType === "choice" ? (
          <LoginChoicePage
            onChooseCustomer={() => setCurrentLoginType("customer")}
            onChooseMechanic={() => setCurrentLoginType("mechanic")}
            onChooseOwner={() => setCurrentLoginType("owner")}
            onBack={() => setCurrentLoginType("landing")}
          />
        ) : currentLoginType === "customer-signup" ? (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onBack={() => setCurrentLoginType("landing")}
            onHome={() => setCurrentLoginType("landing")}
            initialIsSignup={true}
          />
        ) : currentLoginType === "customer" ? (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onBack={() => setCurrentLoginType("choice")}
            onHome={() => setCurrentLoginType("landing")}
          />
        ) : currentLoginType === "mechanic" ? (
          <MechanicLoginPage
            onLoginSuccess={handleLoginSuccess}
            onBack={() => setCurrentLoginType("choice")}
            onHome={() => setCurrentLoginType("landing")}
          />
        ) : (
          <OwnerLoginPage
            onLoginSuccess={handleLoginSuccess}
            onBack={() => setCurrentLoginType("choice")}
            onHome={() => setCurrentLoginType("landing")}
          />
        )}
      </div>
    );
  }

  // While user object is authenticated but role is not yet resolved, show loader
  if (isAuthenticated && !user?.role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] text-white">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">
            Loading role permissions...
          </p>
          <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  // Render dashboard system or landing page if user navigates back
  if (currentPage === "landing") {
    return (
      <div className="min-h-screen bg-moto-dark overflow-x-hidden">
        <DatabaseStatus />
        <MotolinkLanding
          isAuthenticated={true}
          onLoginRequired={() => {}}
          onBook={(shop) => {
            selectShop(shop);
            setShowBookingModal(true);
          }}
        />
        <BookAppointmentModal
          isOpen={showBookingModal}
          onClose={() => setShowBookingModal(false)}
          shopId={selectedShopId}
          onAppointmentBooked={(appointmentData) => {
            setSelectedReceipt(appointmentData);
            setShowReceiptModal(true);
            setShowBookingModal(false);
          }}
        />
        <ViewAppointmentsModal
          isOpen={showAppointmentsModal}
          onClose={() => setShowAppointmentsModal(false)}
        />
        <BrowsePartsModal
          isOpen={showPartsModal}
          onClose={() => setShowPartsModal(false)}
          onLoginRedirect={() => {}}
        />
        <ReceiptModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          receipt={selectedReceipt}
        />
        <CustomerPortalModal
          isOpen={showAccountModal}
          onClose={() => setShowAccountModal(false)}
        />
        <CustomerSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
        <ServiceHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
        />
        <AIChatModal
          isOpen={showAIChat}
          onClose={() => setShowAIChat(false)}
          userRole={user?.role}
        />
      </div>
    );
  }

  const allowedPages = getPagesByRole(user?.role);
  const defaultPage = getDefaultPageByRole(user?.role);

  // If user tries to access unauthorized page, show AccessDenied
  if (user && !allowedPages.includes(currentPage)) {
    return (
      <div className="min-h-screen bg-[#0f0f0f]">
        <SystemNavbar
          currentPage={defaultPage}
          onNavigate={(page: string) => handlePageChange(page as AppPage)}
          onAIChat={() => setShowAIChat(true)}
        />
        <main className="pt-20 px-4 sm:px-6 lg:px-8 pb-12">
          <AccessDenied
            requestedPage={currentPage}
            onNavigate={(page: string) => handlePageChange(page as AppPage)}
          />
        </main>
        <AIChatModal
          isOpen={showAIChat}
          onClose={() => setShowAIChat(false)}
          userRole={user?.role}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <DatabaseStatus />
      {/* Hide SystemNavbar for mechanic-dashboard as it has its own sidebar */}
      {currentPage !== "mechanic-dashboard" && (
        <SystemNavbar
          currentPage={currentPage}
          onNavigate={(page: string) => handlePageChange(page as PageType)}
          onAIChat={() => setShowAIChat(true)}
        />
      )}

      <main
        className={
          currentPage === "mechanic-dashboard"
            ? ""
            : currentPage === "update-parts"
              ? "pt-20"
              : "pt-20 px-4 sm:px-6 lg:px-8 pb-12"
        }
      >
        {currentPage === "dashboard" && (
          <Dashboard
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "inventory" && (
          <InventoryPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "update-parts" && (
          <UpdatePartsPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "appointments" && (
          <AppointmentCalendarPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "customers" && (
          <CustomersListPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}

        {currentPage === "mechanic-portal" && (
          <MechanicPortal
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "mechanic-dashboard" && <MechanicDashboard />}
        {currentPage === "mechanic-availability" && (
          <AdminMechanicAvailability
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "services" && (
          <AdminServicesPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}

        {currentPage === "browse-parts" && (
          <BrowsePartsPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}

        {currentPage === "settings" && (
          <SettingsPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
      </main>

      {/* Contextual AI Support — Admin gets the business-intelligence chatbot */}
      {user?.role === "owner" ? (
        <AdminChatbot
          isOpen={showAIChat}
          onClose={() => setShowAIChat(false)}
        />
      ) : (
        <AIChatModal
          isOpen={showAIChat}
          onClose={() => setShowAIChat(false)}
          userRole={user?.role}
        />
      )}
    </div>
  );
};

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <PartsListProvider>
          {/* ✅ FIX: Wrap AppContent with ErrorBoundary to catch unhandled errors */}
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </PartsListProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
