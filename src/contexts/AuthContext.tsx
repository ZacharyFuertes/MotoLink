import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { User, UserRole, Vehicle } from "../types";
import { supabase } from "../services/supabaseClient";
import { formatDatabaseError } from "../services/dbHelper";

/**
 * Auth Context Type
 */
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (
    email: string,
    password: string,
    name: string,
    phone?: string,
    address?: string,
    vehicle?: Omit<Vehicle, "id" | "customer_id" | "created_at">,
  ) => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  canManageInventory: () => boolean;
  canViewInventory: () => boolean;
  canManageAppointments: () => boolean;
  canViewOwnAppointments: () => boolean;
  canManageUsers: () => boolean;
  canViewReports: () => boolean;
  canAccessAdminDashboard: () => boolean;
  canRecordServiceProgress: () => boolean;
  canAccessCustomerPortal: () => boolean;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * REFACTORED AuthProvider - Clean Supabase pattern
 *
 * FIX for loading animation bug:
 * - Separate session hydration from the loading state
 * - getSession() on mount (fast, reads from localStorage)
 * - Show page immediately without loading spinner
 * - Fetch profile in background
 * - Only show loading spinner during actual login/signup
 */
export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const subscriptionRef = useRef<
    | ReturnType<typeof supabase.auth.onAuthStateChange>["data"]["subscription"]
    | null
  >(null);

  /**
   * Fetch and set user profile from database
   * Runs in background without blocking UI
   */
  const setUserProfileFromSession = async (
    userId: string,
    email?: string,
  ): Promise<User | null> => {
    try {
      const { data: userData, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userData) {
        console.log("✅ [Auth] User profile loaded");
        setUser(userData as User);
        return userData as User;
      }

      // User doesn't exist in DB - create profile
      if (error?.code === "PGRST116") {
        console.log("📝 [Auth] Creating user profile");
        // Use upsert with ignoreDuplicates so this never clobbers a profile
        // created by the registration flow (e.g. owner signup) that raced this fetch.
        // .maybeSingle() returns null instead of a 406 when the row already
        // exists (0 rows returned by the ignored insert).
        const { data: newUser, error: insertError } = await supabase
          .from("users")
          .upsert(
            {
              id: userId,
              email: email || "unknown",
              name: email?.split("@")[0] || "User",
              role: "customer",
            },
            { onConflict: "id", ignoreDuplicates: true },
          )
          .select()
          .maybeSingle();

        if (insertError) {
          console.error("❌ [Auth] Error creating user profile:", insertError);
          return null;
        }

        if (newUser) {
          console.log("✅ [Auth] User profile created");
          setUser(newUser as User);
          return newUser as User;
        }
      } else if (error) {
        console.error("❌ [Auth] Error fetching user profile:", error);
      }
      return null;
    } catch (err) {
      console.error("❌ [Auth] Error setting user profile:", err);
      return null;
    }
  };

  /**
   * EFFECT 1: Restore session on mount (one-time, no loading spinner)
   * This is FAST because getSession() reads from localStorage
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        console.log("� [Auth] Restoring session from storage...");

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user?.id) {
          console.log("✅ [Auth] Session restored");
          // Fetch profile in background (non-blocking)
          setUserProfileFromSession(session.user.id, session.user.email);
        } else {
          console.log("ℹ️ [Auth] No session found");
          setUser(null);
        }
      } catch (err) {
        console.error("❌ [Auth] Error restoring session:", err);
        setUser(null);
      }
    };

    restoreSession();
  }, []);

  /**
   * EFFECT 2: Listen for auth changes (login, logout, etc.)
   * Real-time auth state sync
   */
  useEffect(() => {
    console.log("📡 [Auth] Setting up auth state listener");

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        console.log("📡 [Auth] Auth event:", event);

        if (session?.user?.id) {
          console.log("👤 [Auth] User authenticated:", session.user.id);
          // Fetch profile in background
          setUserProfileFromSession(session.user.id, session.user.email);
        } else {
          console.log("👋 [Auth] User logged out");
          setUser(null);
        }
      } finally {
        // Always reset loading state for any auth event
        setIsLoading(false);
      }
    });

    subscriptionRef.current = data.subscription;

    return () => {
      if (subscriptionRef.current) {
        console.log("🧹 [Auth] Cleaning up auth listener");
        subscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  // Client-side rate limiting for login attempts
  const loginAttemptsRef = useRef<{ count: number; firstAttemptTime: number }>({
    count: 0,
    firstAttemptTime: Date.now(),
  });

  const checkRateLimit = () => {
    const now = Date.now();
    const attempts = loginAttemptsRef.current;

    // Reset window after 2 minutes (120000ms)
    if (now - attempts.firstAttemptTime > 120000) {
      loginAttemptsRef.current = { count: 1, firstAttemptTime: now };
      return true;
    }

    if (attempts.count >= 5) {
      return false;
    }

    attempts.count += 1;
    return true;
  };

  const login = async (email: string, password: string) => {
    if (!checkRateLimit()) {
      setIsLoading(false);
      throw new Error(
        "Too many login attempts. Please try again in 2 minutes.",
      );
    }
    console.log("🔐 [Auth] Login attempt:", email);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data?.user?.id) throw new Error("Login failed");

      // ✅ FIX: Reset login attempts counter on successful login
      loginAttemptsRef.current = { count: 0, firstAttemptTime: Date.now() };

      // Await the profile fetch so that when login() resolves, `user` reflects
      // the real role from the DB (not a stale value from an earlier race)
      await setUserProfileFromSession(data.user.id, data.user.email);

      console.log("✅ [Auth] Login successful");
    } catch (err) {
      console.error("❌ [Auth] Login error:", err);
      setIsLoading(false);
      throw new Error(formatDatabaseError(err));
    }
  };

  const logout = async () => {
    console.log("🚪 [Auth] Logout initiated");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setIsLoading(false);

      // ✅ FIX: Clear all app-owned localStorage keys to prevent data leak
      localStorage.removeItem("moto_last_page");
      localStorage.removeItem("motoshop_appointments");
      localStorage.removeItem("parts_list_filters");
      localStorage.removeItem("parts_list_sort");
      localStorage.removeItem("parts_list_selected");
      // Clear any keys starting with 'parts_list_' or 'moto_' (for caching)
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("parts_list_") || key.startsWith("moto_")) {
          localStorage.removeItem(key);
        }
      });

      console.log("✅ [Auth] Logged out successfully");
    } catch (err) {
      console.error("❌ [Auth] Logout error:", err);
      setUser(null);
      throw new Error(formatDatabaseError(err));
    }
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    phone?: string,
    address?: string,
    vehicle?: Omit<Vehicle, "id" | "customer_id" | "created_at">,
  ) => {
    const role: UserRole = "customer"; // Hardcoded for security
    console.log("📝 [Auth] Signup attempt:", email, "role:", role);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      if (!data?.user?.id) throw new Error("Signup failed");

      // Create user profile (upsert: the auth listener may have already created
      // it during the signUp event — overwrite is fine since role is 'customer' here)
      const { error: profileError } = await supabase
        .from("users")
        .upsert(
          {
            id: data.user.id,
            email,
            name,
            role,
            phone: phone || null,
            address: address || null,
            shop_id: null,
          },
          { onConflict: "id" },
        );

      if (profileError) throw profileError;

      // Create vehicle record if vehicle data is provided
      if (vehicle) {
        const { error: vehicleError } = await supabase.from("vehicles").insert({
          customer_id: data.user.id,
          make: vehicle.make,
          model: vehicle.model,
        });

        if (vehicleError) throw vehicleError;
        console.log("✅ [Auth] Vehicle created for customer");
      }

      console.log("✅ [Auth] Signup successful");
    } catch (err) {
      console.error("❌ [Auth] Signup error:", err);
      setIsLoading(false);
      throw new Error(formatDatabaseError(err));
    }
  };

  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  };

  // RBAC Permission Methods
  const canManageInventory = (): boolean => user?.role === "owner" || user?.role === "admin";
  const canViewInventory = (): boolean =>
    user?.role === "owner" || user?.role === "mechanic" || user?.role === "admin";
  const canManageAppointments = (): boolean => user?.role === "owner" || user?.role === "admin";
  const canViewOwnAppointments = (): boolean =>
    user?.role === "mechanic" || user?.role === "customer";
  const canManageUsers = (): boolean => user?.role === "owner" || user?.role === "admin";
  const canViewReports = (): boolean => user?.role === "owner" || user?.role === "admin";
  const canAccessAdminDashboard = (): boolean =>
    user?.role === "owner" || user?.role === "mechanic" || user?.role === "admin";
  const canRecordServiceProgress = (): boolean => user?.role === "mechanic";
  const canAccessCustomerPortal = (): boolean => user?.role === "customer";

  const refreshUser = async (): Promise<User | null> => {
    if (user?.id) {
      return await setUserProfileFromSession(user.id, user.email);
    }
    return null;
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    signup,
    hasRole,
    canManageInventory,
    canViewInventory,
    canManageAppointments,
    canViewOwnAppointments,
    canManageUsers,
    canViewReports,
    canAccessAdminDashboard,
    canRecordServiceProgress,
    canAccessCustomerPortal,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to use auth context
 * Usage: const { user, isLoading, login, logout } = useAuth()
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
