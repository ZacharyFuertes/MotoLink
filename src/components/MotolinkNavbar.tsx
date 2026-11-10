import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import motolinkLogo from "../../public/favicon.svg";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "../contexts/ThemeContext";

interface MotolinkNavbarProps {
  isAuthenticated: boolean;
  onBrowse: () => void;
  onMap: () => void;
  onAbout: () => void;
  onLogin: () => void;
  onGetStarted: () => void;
  onLogout?: () => void;
  onOpenProfile?: () => void;
}

const MotolinkNavbar = ({ isAuthenticated, onBrowse, onMap, onAbout, onLogin, onGetStarted, onLogout, onOpenProfile }: MotolinkNavbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const { isDark } = useTheme();

  // Scroll-responsive shell: transparent at the very top, floating glass once scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY ?? 0) > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Base navigation links action-oriented labels.
  const links = [
    { label: "Explore Shops", action: onBrowse },
    { label: "Live Locator", action: onMap },
    { label: "Platform Info", action: onAbout },
  ];

  const authLinks = links;

  const activate = (action: () => void, label?: string) => {
    if (label) setActiveLabel(label);
    action();
    setMenuOpen(false);
  };

  // In light mode the navbar always shows as a light glass bar so it stays a
  // light color even while scrolling through the hero. In dark mode it starts
  // transparent over the hero and gains its glass shell once scrolled.
  const showShell = isDark ? scrolled : true;

  return (
    <motion.header
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-100 ${showShell ? "nav-scrolled" : "nav-top keep-dark"} ${
        showShell
          ? "border-moto-gray bg-moto-dark"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <motion.button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex items-center text-left"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.98 }}
        >
          <img src={motolinkLogo} alt="Motolink Autoshop Clientele" className="moto-logo h-16 w-auto max-w-[190px] object-contain sm:h-[72px] sm:max-w-[230px]" />
        </motion.button>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {authLinks.map((link) => {
            const isActive = activeLabel === link.label;
            return (
              <motion.button
                key={link.label}
                onClick={() => activate(link.action, link.label)}
                onHoverStart={() => setActiveLabel(link.label)}
                onHoverEnd={() => setActiveLabel((current) => (current === link.label ? "" : current))}
                whileTap={{ scale: 0.97 }}
                className="relative whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-200 transition-colors duration-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent focus-visible:ring-offset-2"
              >
                {isActive && (
                  <motion.span
                    layoutId="navbar-active"
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-moto-accent"
                  />
                )}
                <span className="relative z-10">{link.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Desktop CTA / auth */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              {onOpenProfile && (
                <motion.button
                  onClick={onOpenProfile}
                  whileTap={{ scale: 0.96 }}
                  className="landing-nav-button inline-flex h-10 items-center gap-2 rounded-md border border-moto-gray px-3 text-sm font-semibold text-slate-200 transition-colors duration-100 hover:border-moto-accent hover:text-white"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-moto-accent text-[10px] font-bold text-slate-950">
                    M
                  </span>
                  My Profile
                </motion.button>
              )}
              {onLogout && (
                <motion.button
                  onClick={onLogout}
                  whileTap={{ scale: 0.96 }}
                  className="landing-nav-button h-10 rounded-md border border-moto-gray px-3 text-sm font-semibold text-slate-200 transition-colors duration-100 hover:border-moto-accent hover:text-white"
                >
                  Log out
                </motion.button>
              )}
            </>
          ) : (
            <>
              <motion.button
                onClick={onLogin}
                whileTap={{ scale: 0.96 }}
                className={`h-10 rounded-xl border px-4 text-sm font-semibold shadow-sm transition-all duration-200 ${
                  isDark
                    ? "border-white/15 bg-white/5 text-white shadow-black/20 hover:border-moto-accent hover:bg-moto-accent/10 hover:text-moto-accent"
                    : "border-slate-200 bg-white text-slate-900 shadow-slate-200/80 hover:border-moto-accent hover:text-moto-accent"
                }`}
              >
                Login
              </motion.button>
              <motion.button
                onClick={onGetStarted}
                whileTap={{ scale: 0.96 }}
                className={`inline-flex h-10 items-center justify-center whitespace-nowrap rounded-xl px-4 text-sm font-semibold shadow-md transition-all duration-200 ${
                  isDark
                    ? "bg-moto-accent text-slate-950 shadow-moto-accent/30 hover:bg-moto-accent-dark"
                    : "bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-500"
                }`}
              >
                Get Started
              </motion.button>
            </>
          )}
          <ThemeToggle className="h-10 w-10" />
        </div>

        {/* Mobile controls theme toggle + clean text-based menu control */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle className="h-10 w-10" />
          <motion.button
            onClick={() => setMenuOpen((value) => !value)}
            whileTap={{ scale: 0.94 }}
            className="landing-nav-button h-10 rounded-md border border-moto-gray px-3 text-sm font-semibold text-slate-100 transition-colors duration-100 hover:border-moto-accent"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
          >
            {menuOpen ? "Close" : "Menu"}
          </motion.button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden border-t border-moto-gray bg-moto-dark md:hidden"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
              {authLinks.map((link) => (
                <motion.button
                  key={link.label}
                  onClick={() => activate(link.action, link.label)}
                  whileTap={{ scale: 0.98 }}
                  className="rounded-md px-3 py-3 text-left text-sm font-medium text-slate-100 transition-colors duration-100 hover:bg-moto-gray/40 hover:text-white"
                >
                  {link.label}
                </motion.button>
              ))}
              <div className="mt-2 flex flex-col gap-2.5">
                {isAuthenticated ? (
                  <>
                    {onOpenProfile && (
                      <motion.button
                        onClick={() => activate(onOpenProfile, "My Profile")}
                        whileTap={{ scale: 0.98 }}
                        className="landing-button-secondary h-10 border-moto-accent px-3 text-sm"
                      >
                        My Profile
                      </motion.button>
                    )}
                    {onLogout && (
                      <motion.button
                        onClick={() => activate(onLogout)}
                        whileTap={{ scale: 0.98 }}
                        className="landing-nav-button h-10 rounded-md border border-moto-gray px-3 text-sm font-semibold text-slate-200"
                      >
                        Log out
                      </motion.button>
                    )}
                  </>
                ) : (
                  <>
                    <motion.button
                      onClick={() => activate(onLogin, "Login")}
                      whileTap={{ scale: 0.98 }}
                      className={`h-10 w-full rounded-xl border text-sm font-semibold shadow-sm transition-all duration-200 ${
                        isDark
                          ? "border-white/15 bg-white/5 text-white shadow-black/20 hover:border-moto-accent hover:bg-moto-accent/10 hover:text-moto-accent"
                          : "border-slate-200 bg-white text-slate-900 shadow-slate-200/80 hover:border-moto-accent hover:text-moto-accent"
                      }`}
                    >
                      Login
                    </motion.button>
                    <motion.button
                      onClick={() => activate(onGetStarted, "Get Started")}
                      whileTap={{ scale: 0.98 }}
                      className={`h-10 w-full rounded-xl text-sm font-semibold shadow-md transition-all duration-200 ${
                        isDark
                          ? "bg-moto-accent text-slate-950 shadow-moto-accent/30 hover:bg-moto-accent-dark"
                          : "bg-emerald-600 text-white shadow-emerald-600/30 hover:bg-emerald-500"
                      }`}
                    >
                      Get Started
                    </motion.button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default MotolinkNavbar;
