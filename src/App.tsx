import "./globals.css";
import { useState, useEffect, useRef } from "react";
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
import AdminPlatformDashboard from "./pages/AdminPlatformDashboard";
import AdminShopsPage from "./pages/AdminShopsPage";
import OwnerPlatformDashboard from "./pages/OwnerPlatformDashboard";
import InventoryPage from "./pages/InventoryPage";
import AppointmentCalendarPage from "./pages/AppointmentCalendarPage";

import CustomersListPage from "./pages/CustomersListPage";
import AdminServicesPage from "./pages/AdminServicesPage";
import BrowsePartsPage from "./pages/BrowsePartsPage";
import LowStockPage from "./pages/LowStockPage";

import SettingsPage from "./pages/SettingsPage";
import ShopSettingsPage from "./pages/ShopSettingsPage";
import AdminMechanicAvailability from "./pages/AdminMechanicAvailability";
import LoginPage from "./pages/LoginPage";
import ShopOwnerLoginPage from "./pages/ShopOwnerLoginPage";
import AdminLoginPage from "./pages/AdminLoginPage";
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
import ShopDetailPage from "./pages/ShopDetailPage";
import { ShopSearchResult } from "./types/shop";

type PageType = AppPage;

type LoginType =
  | "landing"
  | "choice"
  | "customer"
  | "customer-signup"
  | "owner"
  | "admin"
  | "owner-signup";

const AppContent: React.FC = () => {
  const { isAuthenticated, user, isLoading, logout } = useAuth();

  // Initialize currentPage from localStorage, falling back to landing
  const [currentPage, setCurrentPage] = useState<AppPage>(() => {
    const savedPage = localStorage.getItem("moto_last_page") as AppPage;
    return savedPage || "landing";
  });
  const [currentLoginType, setCurrentLoginType] =
    useState<LoginType>(() => {
      // Restore the login/registration screen the user was on before a reload
      // (e.g. mid shop-owner registration), so they stay on the same page.
      const saved = localStorage.getItem("moto_login_type") as LoginType;
      return saved || "landing";
    });
  const [loginCompleted, setLoginCompleted] = useState(false);
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
  const [viewingShopId, setViewingShopId] = useState<string | null>(
    () => localStorage.getItem("moto_viewing_shop_id") || null
  );

  const selectShop = (shop: ShopSearchResult) => {
    localStorage.setItem("motolink_selected_shop_id", shop.id);
    setSelectedShopId(shop.id);
  };

  const openShopDetail = (shop: ShopSearchResult) => {
    localStorage.setItem("moto_viewing_shop_id", shop.id);
    setViewingShopId(shop.id);
  };

  const closeShopDetail = () => {
    localStorage.removeItem("moto_viewing_shop_id");
    setViewingShopId(null);
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
      navigateTo("landing");
      return;
    }

    if (!isPageAllowedForRole(newPage, user.role)) {
      const fallbackPage = getDefaultPageByRole(user.role);
      navigateTo(fallbackPage);
      return;
    }

    navigateTo(newPage);
  };

  // Reset page to landing when user logs out - use useEffect to avoid render conflicts.
  // Use a ref so we only reset on a REAL logout transition (authenticated → not),
  // not on initial mount while the Supabase session is still being restored.
  const wasAuthenticatedRef = useRef(isAuthenticated);
  useEffect(() => {
    const wasAuthenticated = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = isAuthenticated;
    if (wasAuthenticated && !isAuthenticated) {
      console.log("🚪 User logged out, resetting to landing");
      localStorage.removeItem("moto_last_page");
      localStorage.removeItem("moto_login_type");
      setCurrentPage("landing");
      setCurrentLoginType("landing");
      setLoginCompleted(false);
    }
  }, [isAuthenticated]);

  // Persist the current login/registration screen so a browser reload returns
  // the user to the same page (login form, signup wizard, portal choice, etc.).
  useEffect(() => {
    if (currentLoginType === "landing") {
      localStorage.removeItem("moto_login_type");
    } else {
      localStorage.setItem("moto_login_type", currentLoginType);
    }
  }, [currentLoginType]);

  // Clear stale "dashboard" page for admin on mount
  useEffect(() => {
    if (isAuthenticated && user?.role === "admin" && currentPage === "dashboard") {
      localStorage.removeItem("moto_last_page");
      navigateTo("admin-dashboard");
    }
  }, [isAuthenticated, user?.role, currentPage]);

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

  // Authoritative portal-role enforcement while on a login screen. If the
  // authenticated user's role doesn't match the portal they signed into, force
  // a full logout (clears the persisted Supabase session + localStorage) so the
  // wrong role can never land on or persist into the wrong dashboard — even on
  // a browser refresh.
  useEffect(() => {
    if (!isAuthenticated || !user?.role || loginCompleted) return;
    const expectedRole =
      currentLoginType === "customer" || currentLoginType === "customer-signup"
        ? "customer"
        : currentLoginType === "admin"
        ? "admin"
        : currentLoginType === "owner" || currentLoginType === "owner-signup"
        ? "owner"
        : null;
    if (!expectedRole) return;
    if (user.role !== expectedRole) {
      console.log(
        `⚠️ [App] Role '${user.role}' doesn't match portal '${currentLoginType}', forcing logout`,
      );
      logout();
    }
  }, [isAuthenticated, user?.role, currentLoginType, loginCompleted, logout]);

  // A login/signup screen is active when we're unauthenticated, or authenticated
  // but the current login type hasn't confirmed completion yet.
  const isLoginScreen = [
    "choice",
    "customer",
    "customer-signup",
    "admin",
    "owner",
    "owner-signup",
  ].includes(currentLoginType);

  // If auth loading and we're NOT on a login screen, show a spinner placeholder.
  // On a login screen we let the login page manage its own loading UI so it stays
  // mounted through login — this lets its role guard + onLoginSuccess fire (the
  // wrong-portal guard is dead code if the login page unmounts mid-login).
  if (isLoading && !isLoginScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-slate-900">
        <div className="text-center">
          <p className="text-xl font-semibold mb-2">
            Checking authentication and role permissions...
          </p>
          <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  // If not authenticated, or still on a login screen awaiting role confirmation,
  // show landing page or login. The login page stays mounted until onLoginSuccess
  // fires so its role guard can reject wrong-portal logins (e.g. admin creds on
  // the customer form) instead of silently dropping into a dashboard.
  if (!isAuthenticated || (!loginCompleted && isLoginScreen)) {
    const handleLoginSuccess = () => {
      // Role-based destination: owners/admins go straight to their own
      // dashboard; everyone else goes to the splash/landing page
      setLoginCompleted(true);
      localStorage.removeItem("moto_login_type");
      if (user?.role === "owner") {
        navigateTo("dashboard");
      } else if (user?.role === "admin") {
        navigateTo("admin-dashboard");
      } else {
        navigateTo("landing");
        if (localStorage.getItem("motolink_selected_shop_id")) {
          setShowBookingModal(true);
        }
      }
    };

    const handleOpenLogin = () => {
      setLoginCompleted(false);
      setCurrentLoginType("choice");
    };

    return (
      <div className="min-h-screen bg-white overflow-x-hidden">
        <DatabaseStatus />
        {viewingShopId ? (
          <ShopDetailPage
            shopId={viewingShopId}
            onBack={closeShopDetail}
            onConnect={(shopId) => {
              localStorage.setItem("motolink_selected_shop_id", shopId);
              setSelectedShopId(shopId);
              closeShopDetail();
              handleOpenLogin();
            }}
          />
        ) : currentLoginType === "landing" ? (
          <MotolinkLanding
            isAuthenticated={false}
            onLoginRequired={(shop) => {
              if (shop) selectShop(shop);
              handleOpenLogin();
            }}
            onBook={() => handleOpenLogin()}
            onViewShop={openShopDetail}
            onAppointments={() => handleOpenLogin()}
          />
        ) : currentLoginType === "choice" ? (
          <LoginChoicePage
            onChooseCustomer={() => setCurrentLoginType("customer")}
            onChooseOwner={() => setCurrentLoginType("owner")}
            onChooseRegister={() => setCurrentLoginType("owner-signup")}
            onChooseAdmin={() => setCurrentLoginType("admin")}
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
        ) : currentLoginType === "admin" ? (
          <AdminLoginPage
            onLoginSuccess={handleLoginSuccess}
            onBack={() => setCurrentLoginType("choice")}
            onHome={() => setCurrentLoginType("landing")}
          />
        ) : currentLoginType === "owner-signup" ? (
          <ShopOwnerLoginPage
            onLoginSuccess={handleLoginSuccess}
            onBack={() => setCurrentLoginType("choice")}
            onHome={() => setCurrentLoginType("landing")}
            initialIsSignup={true}
          />
        ) : (
          <ShopOwnerLoginPage
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
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-slate-900">
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
      <div className="min-h-screen bg-white overflow-x-hidden">
        <DatabaseStatus />
        {viewingShopId ? (
          <ShopDetailPage
            shopId={viewingShopId}
            onBack={closeShopDetail}
            onConnect={(shopId) => {
              selectShop({ id: shopId } as ShopSearchResult);
              closeShopDetail();
              setShowBookingModal(true);
            }}
          />
        ) : (
          <>
            <MotolinkLanding
              isAuthenticated={true}
              onLoginRequired={() => {}}
              onBook={(shop) => {
                if (shop.is_open === false) {
                  openShopDetail(shop);
                  return;
                }
                selectShop(shop);
                setShowBookingModal(true);
              }}
              onLogout={() => {
                logout().catch((error) => {
                  console.error("Logout failed:", error);
                  window.location.href = "/";
                });
              }}
              onViewShop={openShopDetail}
              onAppointments={() => setShowAppointmentsModal(true)}
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
          </>
        )}
      </div>
    );
  }

  const allowedPages = getPagesByRole(user?.role);
  const defaultPage = getDefaultPageByRole(user?.role);

  const isAdminRole = user?.role === "admin";
  const adminLayoutPages = [
    "admin-dashboard",
    "admin-shops",
    "settings",
  ];
  const isAdminLayout = isAdminRole && adminLayoutPages.includes(currentPage);

  const ownerLayoutPages = [
    "dashboard",
    "shop-settings",
    "inventory",
    "update-parts",
    "appointments",
    "customers",
    "services",
    "mechanic-availability",
    "low-stock",
    "settings",
  ];
  const isOwnerLayout =
    user?.role === "owner" && ownerLayoutPages.includes(currentPage);

  // If user tries to access unauthorized page, show AccessDenied
  if (user && !allowedPages.includes(currentPage)) {
    const deniedContent = (
      <AccessDenied
        requestedPage={currentPage}
        onNavigate={(page: string) => handlePageChange(page as AppPage)}
      />
    );
    return (
      <div className="min-h-screen bg-[#f5f5f5]">
        {isAdminRole ? (
          <AdminPlatformDashboard
            onNavigate={(page: string) => handlePageChange(page as AppPage)}
            currentPage={currentPage}
          >
            {deniedContent}
          </AdminPlatformDashboard>
        ) : user?.role === "owner" ? (
          <OwnerPlatformDashboard
            onNavigate={(page: string) => handlePageChange(page as AppPage)}
            currentPage={currentPage}
          >
            {deniedContent}
          </OwnerPlatformDashboard>
        ) : (
          <>
            <SystemNavbar
              currentPage={defaultPage}
              onNavigate={(page: string) => handlePageChange(page as AppPage)}
              onAIChat={() => setShowAIChat(true)}
            />
            <main className="pt-20 px-4 sm:px-6 lg:px-8 pb-12">
              {deniedContent}
            </main>
            <AIChatModal
              isOpen={showAIChat}
              onClose={() => setShowAIChat(false)}
              userRole={user?.role}
            />
          </>
        )}
      </div>
    );
  }

  // Admin layout: sidebar persists across all admin pages
  if (isAdminLayout) {
    return (
      <div className="min-h-screen bg-[#f5f5f5]">
        <DatabaseStatus />
        <AdminPlatformDashboard
          onNavigate={(page: string) => handlePageChange(page as PageType)}
          currentPage={currentPage}
        >
          {currentPage === "admin-shops" && (
            <AdminShopsPage />
          )}
          {currentPage === "settings" && (
            <SettingsPage
              onNavigate={(page: string) => handlePageChange(page as PageType)}
            />
          )}
        </AdminPlatformDashboard>
        {user?.role === "admin" && (
          <AdminChatbot
            isOpen={showAIChat}
            onClose={() => setShowAIChat(false)}
          />
        )}
      </div>
    );
  }

  // Owner layout: sidebar persists across all owner pages
  if (isOwnerLayout) {
    return (
      <div className="min-h-screen bg-[#f5f5f5]">
        <DatabaseStatus />
        <OwnerPlatformDashboard
          onNavigate={(page: string) => handlePageChange(page as PageType)}
          currentPage={currentPage}
        >
          {currentPage === "shop-settings" && (
            <ShopSettingsPage
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
          {currentPage === "services" && (
            <AdminServicesPage
              onNavigate={(page: string) => handlePageChange(page as PageType)}
            />
          )}
          {currentPage === "mechanic-availability" && (
            <AdminMechanicAvailability
              onNavigate={(page: string) => handlePageChange(page as PageType)}
            />
          )}
          {currentPage === "low-stock" && (
            <LowStockPage
              onNavigate={(page: string) => handlePageChange(page as PageType)}
            />
          )}
          {currentPage === "settings" && (
            <SettingsPage
              onNavigate={(page: string) => handlePageChange(page as PageType)}
            />
          )}
        </OwnerPlatformDashboard>
        {user?.role === "owner" && (
          <AdminChatbot
            isOpen={showAIChat}
            onClose={() => setShowAIChat(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <DatabaseStatus />
      <SystemNavbar
        currentPage={currentPage}
        onNavigate={(page: string) => handlePageChange(page as PageType)}
        onAIChat={() => setShowAIChat(true)}
      />

      <main
        className={
          currentPage === "update-parts"
            ? "pt-20"
            : "pt-20 px-4 sm:px-6 lg:px-8 pb-12"
        }
      >
        {currentPage === "dashboard" && (
          <Dashboard
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "browse-parts" && (
          <BrowsePartsPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "low-stock" && (
          <LowStockPage
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
        {currentPage === "services" && (
          <AdminServicesPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "mechanic-availability" && (
          <AdminMechanicAvailability
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "settings" && (
          <SettingsPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
        {currentPage === "shop-settings" && (
          <ShopSettingsPage
            onNavigate={(page: string) => handlePageChange(page as PageType)}
          />
        )}
      </main>

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
