import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  User,
  LogOut,
  Settings,
  ChevronDown,
  CalendarDays,
  History,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface NavbarProps {
  onShowAppointments?: () => void;
  onBookAppointment?: () => void;
  onBrowseParts?: () => void;
  onJoinSignIn?: () => void;
  onSignUp?: () => void;
  onViewAccount?: () => void;
  onSettings?: () => void;
  onServiceHistory?: () => void;
  onAIChat?: () => void;
}

// SVG Icon component
interface NavIcon {
  label: string;
  path: string;
}

const navIcons: Record<string, NavIcon> = {
  "AI CHAT": {
    label: "AI CHAT",
    path: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
  },
  "BROWSE PARTS": {
    label: "BROWSE PARTS",
    path: "M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54C14.43 3.17 14.24 3 14 3h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 9.47c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  },
  "BOOK APPOINTMENT": {
    label: "BOOK APPOINTMENT",
    path: "M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13zM8 10H6v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H6v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z",
  },
  SERVICES: {
    label: "SERVICES",
    path: "M22.7 19.6l-7.5-7.5c.9-2.1.5-4.6-1.2-6.3-1.8-1.8-4.4-2.2-6.6-1.1L11 8.4 8.4 11 4.7 7.4C3.6 9.6 4 12.2 5.8 14c1.7 1.7 4.2 2.1 6.3 1.2l7.5 7.5c.4.4 1 .4 1.4 0l1.6-1.6c.5-.4.5-1.1.1-1.5z",
  },
  "ABOUT US": {
    label: "ABOUT US",
    path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  },
  MECHANICS: {
    label: "MECHANICS",
    path: "M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z",
  },
  "MY APPOINTMENTS": {
    label: "MY APPOINTMENTS",
    path: "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  },
};

interface IconProps {
  path: string;
}

const NavItemIcon: React.FC<IconProps> = ({ path }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-3.5 h-3.5 text-[#666] group-hover:text-[#e63946] transition-colors duration-300"
  >
    <path d={path} />
  </svg>
);

const Navbar: React.FC<NavbarProps> = ({
  onShowAppointments,
  onBookAppointment,
  onBrowseParts,
  onJoinSignIn,
  onSignUp,
  onViewAccount,
  onSettings,
  onServiceHistory,
  onAIChat,
}) => {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Track scroll for navbar style change
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const scrollToSection = (id: string) => {
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        // Get the header height (approx 80px) to offset the scroll
        const headerOffset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    }, 100); // 100ms delay helps prevent mobile layout shifting issues
  };

  const navItems = [
    { label: "AI CHAT", onClick: onAIChat },
    { label: "BROWSE PARTS", onClick: onBrowseParts },
    { label: "BOOK APPOINTMENT", onClick: onBookAppointment },
    { label: "SERVICES", onClick: () => scrollToSection("services") },
    { label: "ABOUT US", onClick: () => scrollToSection("about-us") },
    { label: "MECHANICS", onClick: () => scrollToSection("mechanics") },
    ...(user
      ? [{ label: "MY APPOINTMENTS", onClick: onShowAppointments }]
      : []),
  ];

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-[#222] ${
        scrolled ? "bg-[#0a0a0a] shadow-2xl" : "bg-[#0a0a0a]"
      }`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* Red accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#e63946]" />

      <div className="max-w-[1920px] mx-auto px-4 lg:px-6 xl:px-10">
        <div className="flex items-center justify-between h-[72px] lg:h-[100px] gap-4 lg:gap-8 xl:gap-12">
          <motion.div
            className="flex items-center gap-3 lg:gap-4 cursor-pointer select-none shrink-0 group"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {/* Logo Image */}
            <div className="relative w-14 h-14 lg:w-[68px] lg:h-[68px] xl:w-[78px] xl:h-[78px] rounded-full bg-white flex items-center justify-center border-2 border-[#333] group-hover:border-[#e63946] shadow-[0_0_20px_rgba(0,0,0,0.8)] overflow-hidden shrink-0 transition-all duration-300">
              <div className="absolute inset-0 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] rounded-full pointer-events-none z-10" />
              <img
                src="/logo.png"
                alt="MotoLink Logo"
                className="w-[90%] h-[90%] object-contain scale-110 relative z-0"
              />
            </div>
            {/* Brand Text */}
            <div className="flex flex-col leading-none">
              <span
                className="text-lg xl:text-2xl font-display font-black tracking-wider uppercase"
                style={{
                  background:
                    "linear-gradient(180deg, #ffffff 0%, #c0c0c0 40%, #888888 70%, #666666 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "none",
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))",
                }}
              >
                MotoLink
              </span>
            </div>
          </motion.div>

          {/* ── Center Nav Items (Desktop) ── */}
          <div className="hidden lg:flex flex-1 justify-center items-center gap-0.5 xl:gap-2 overflow-hidden px-2">
            {navItems.map((item, idx) => {
              const iconData = navIcons[item.label];
              return (
                <motion.button
                  key={idx}
                  onClick={() => {
                    item.onClick?.();
                    setMobileOpen(false);
                  }}
                  className="relative flex items-center gap-1.5 px-1 xl:px-3 py-2 text-[9px] xl:text-xs font-bold tracking-widest uppercase text-[#bbb] hover:text-white transition-all duration-300 border border-transparent hover:border-[#333] hover:bg-[#111] group whitespace-nowrap shrink-0"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {iconData && <NavItemIcon path={iconData.path} />}
                  {item.label}
                </motion.button>
              );
            })}
          </div>

          {/* ── Right Side ── */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {user ? (
              <div ref={profileRef} className="relative">
                {/* Profile Trigger */}
                <motion.button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-3 pl-2 pr-4 py-2 hover:bg-[#111111] border border-transparent hover:border-[#333] transition-all group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="relative w-10 h-10 bg-[#111111] border border-[#333] flex items-center justify-center">
                    <span className="text-white text-lg font-display font-black leading-none group-hover:text-[#e63946] transition-colors">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-[10px] font-bold text-[#6b6b6b] uppercase tracking-widest group-hover:text-white truncate max-w-[80px] xl:max-w-[120px] transition-colors leading-none">
                      {user.name}
                    </span>
                    <span className="text-[8px] font-bold text-[#e63946] uppercase tracking-widest leading-none">
                      ONLINE
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-[#6b6b6b] transition-transform duration-300 ml-2 ${profileOpen ? "rotate-180" : ""}`}
                    strokeWidth={2}
                  />
                </motion.button>

                {/* Dropdown */}
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute right-0 top-full mt-3 w-64 bg-[#0a0a0a] border border-[#222] shadow-2xl py-2"
                    >
                      {/* User info */}
                      <div className="px-5 py-4 border-b border-[#222]">
                        <p className="text-white font-display text-lg tracking-wide uppercase truncate leading-none mb-1">
                          {user.name}
                        </p>
                        <p className="text-[#6b6b6b] text-[10px] font-bold tracking-widest uppercase truncate">
                          {user.email}
                        </p>
                      </div>

                      <div className="py-2">
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            onViewAccount?.();
                          }}
                          className="w-full text-left px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#555] hover:text-white hover:bg-[#111111] transition flex items-center gap-3"
                        >
                          <User size={14} className="text-[#e63946]" /> VIEW
                          ACCOUNT
                        </button>
                        {user && (
                          <button
                            onClick={() => {
                              setProfileOpen(false);
                              onShowAppointments?.();
                            }}
                            className="w-full text-left px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#555] hover:text-white hover:bg-[#111111] transition flex items-center gap-3"
                          >
                            <CalendarDays
                              size={14}
                              className="text-[#e63946]"
                            />{" "}
                            MY APPOINTMENTS
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            onSettings?.();
                          }}
                          className="w-full text-left px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#555] hover:text-white hover:bg-[#111111] transition flex items-center gap-3"
                        >
                          <Settings size={14} className="text-[#e63946]" />{" "}
                          SETTINGS
                        </button>
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            onServiceHistory?.();
                          }}
                          className="w-full text-left px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#555] hover:text-white hover:bg-[#111111] transition flex items-center gap-3"
                        >
                          <History size={14} className="text-[#e63946]" />{" "}
                          SERVICE HISTORY
                        </button>
                      </div>

                      <div className="border-t border-[#222] py-2">
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            logout().catch(() => window.location.reload());
                          }}
                          className="w-full text-left px-5 py-3 text-[10px] font-bold tracking-widest uppercase text-[#e63946] hover:text-white hover:bg-[#111111] transition flex items-center gap-3"
                        >
                          <LogOut size={14} /> LOGOUT
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <motion.button
                  onClick={onSignUp || onJoinSignIn}
                  className="relative px-6 py-3 bg-transparent text-[10px] font-bold tracking-[0.2em] uppercase text-[#6b6b6b] border border-[#333] hover:border-[#666] hover:text-white transition-all whitespace-nowrap"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  SIGN UP
                </motion.button>
                <motion.button
                  onClick={onJoinSignIn}
                  className="relative px-8 py-3 bg-[#e63946] hover:bg-[#d12d39] font-bold tracking-[0.2em] uppercase text-white text-[10px] group transition-all whitespace-nowrap"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="relative z-10 block">SIGN IN</span>
                </motion.button>
              </div>
            )}
          </div>

          {/* ── Mobile Menu Button ── */}
          <motion.button
            className="md:hidden p-3 text-[#6b6b6b] hover:text-white border border-[#333] hover:bg-[#111111] transition"
            onClick={() => setMobileOpen(!mobileOpen)}
            whileTap={{ scale: 0.9 }}
          >
            {mobileOpen ? (
              <X size={20} strokeWidth={2} />
            ) : (
              <Menu size={20} strokeWidth={2} />
            )}
          </motion.button>
        </div>

        {/* ── Mobile Navigation ── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="md:hidden overflow-hidden border-t border-[#222] bg-[#0a0a0a]"
            >
              <div className="py-4 px-4 space-y-2">
                {navItems.map((item, idx) => {
                  const iconData = navIcons[item.label];
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        item.onClick?.();
                        setMobileOpen(false);
                      }}
                      className="w-full flex items-center gap-1.5 text-left px-5 py-4 text-[11px] font-bold tracking-[0.2em] text-[#bbb] hover:text-white hover:bg-[#111] border border-transparent hover:border-[#333] transition-all uppercase"
                    >
                      {iconData && <NavItemIcon path={iconData.path} />}
                      {item.label}
                    </button>
                  );
                })}
                <div className="pt-4 pb-2 border-t border-[#222] mt-4 space-y-2">
                  {user ? (
                    <>
                      <button
                        onClick={() => {
                          setMobileOpen(false);
                          onViewAccount?.();
                        }}
                        className="w-full text-left px-5 py-4 text-[11px] font-bold tracking-[0.2em] text-[#555] hover:text-white hover:bg-[#111] border border-transparent hover:border-[#333] transition-all uppercase flex items-center gap-3"
                      >
                        <User size={14} className="text-[#e63946]" /> VIEW
                        ACCOUNT
                      </button>
                      <button
                        onClick={() => {
                          setMobileOpen(false);
                          onSettings?.();
                        }}
                        className="w-full text-left px-5 py-4 text-[11px] font-bold tracking-[0.2em] text-[#555] hover:text-white hover:bg-[#111] border border-transparent hover:border-[#333] transition-all uppercase flex items-center gap-3"
                      >
                        <Settings size={14} className="text-[#e63946]" />{" "}
                        SETTINGS
                      </button>
                      <button
                        onClick={() => {
                          setMobileOpen(false);
                          onServiceHistory?.();
                        }}
                        className="w-full text-left px-5 py-4 text-[11px] font-bold tracking-[0.2em] text-[#555] hover:text-white hover:bg-[#111] border border-transparent hover:border-[#333] transition-all uppercase flex items-center gap-3"
                      >
                        <History size={14} className="text-[#e63946]" /> SERVICE
                        HISTORY
                      </button>
                      <button
                        onClick={() => {
                          setMobileOpen(false);
                          logout().catch(() => window.location.reload());
                        }}
                        className="w-full text-left px-5 py-4 text-[11px] font-bold tracking-[0.2em] text-[#e63946] hover:text-white hover:bg-[#111] border border-transparent hover:border-[#333] transition-all uppercase flex items-center gap-3 mt-4"
                      >
                        <LogOut size={14} /> LOGOUT
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 pt-2">
                      <button
                        onClick={() => {
                          (onSignUp || onJoinSignIn)?.();
                          setMobileOpen(false);
                        }}
                        className="w-full px-5 py-4 border border-[#333] hover:border-[#666] text-[#6b6b6b] hover:text-white font-bold tracking-[0.2em] text-[11px] transition-all uppercase"
                      >
                        SIGN UP
                      </button>
                      <button
                        onClick={() => {
                          onJoinSignIn?.();
                          setMobileOpen(false);
                        }}
                        className="w-full px-5 py-4 bg-[#e63946] hover:bg-[#d12d39] text-white font-bold tracking-[0.2em] text-[11px] transition-all uppercase"
                      >
                        SIGN IN
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
};

export default Navbar;
