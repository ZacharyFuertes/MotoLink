import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import motolinkLogo from "../../public/favicon.svg";

interface MotolinkNavbarProps {
  isAuthenticated: boolean;
  onBrowse: () => void;
  onMap: () => void;
  onAbout: () => void;
  onGetStarted: () => void;
  onLogout?: () => void;
  onAppointments: () => void;
}

const MotolinkNavbar = ({ isAuthenticated, onBrowse, onMap, onAbout, onGetStarted, onLogout, onAppointments }: MotolinkNavbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string>("");

  // Scroll-responsive shell: transparent at the very top, floating glass once scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled((window.scrollY ?? 0) > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Base navigation links — action-oriented labels.
  const links = [
    { label: "Explore Shops", action: onBrowse },
    { label: "Live Locator", action: onMap },
    { label: "Platform Info", action: onAbout },
  ];

  // "Bookings" is only surfaced to authenticated visitors.
  const authLinks = isAuthenticated ? [...links, { label: "Bookings", action: onAppointments }] : links;

  const activate = (action: () => void, label?: string) => {
    if (label) setActiveLabel(label);
    action();
    setMenuOpen(false);
  };

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 26, mass: 0.9 }}
      className={`fixed inset-x-0 top-0 z-40 border-b transition-all duration-500 ${
        scrolled
          ? "border-slate-800/60 bg-slate-950/60 backdrop-blur-xl shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
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
          <img src={motolinkLogo} alt="Motolink Autoshop Clientele" className="h-16 sm:h-20 lg:h-24 max-w-[200px] sm:max-w-[260px] w-auto object-contain drop-shadow-[0_0_16px_rgba(34,211,238,0.35)]" />
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
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="relative whitespace-nowrap px-4 py-2 text-sm font-semibold text-slate-200 transition-colors duration-300 hover:text-white"
              >
                {isActive && (
                  <motion.span
                    layoutId="navbar-active"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-300 shadow-[0_0_12px_rgba(34,211,238,0.6)]"
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
            onLogout && (
              <motion.button
                onClick={onLogout}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-200 backdrop-blur-md transition hover:border-cyan-400/60 hover:text-white"
              >
                Log out
              </motion.button>
            )
          ) : (
            <motion.button
              onClick={onGetStarted}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-5 py-2.5 text-sm font-bold text-slate-950 whitespace-nowrap border border-cyan-300/40 transition-shadow duration-300 shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:shadow-[0_0_28px_rgba(34,211,238,0.45)]"
            >
              Get Started
            </motion.button>
          )}
        </div>

        {/* Mobile toggle — clean text-based control */}
        <motion.button
          onClick={() => setMenuOpen((value) => !value)}
          whileTap={{ scale: 0.94 }}
          className="rounded-xl px-4 py-2 text-sm font-bold text-slate-100 border border-slate-800 bg-slate-900/40 backdrop-blur-md transition hover:border-cyan-400/60 md:hidden"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          {menuOpen ? "Close" : "Menu"}
        </motion.button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden md:hidden border-t border-slate-800/60 backdrop-blur-xl bg-slate-950/70"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-4">
              {authLinks.map((link) => (
                <motion.button
                  key={link.label}
                  onClick={() => activate(link.action, link.label)}
                  whileTap={{ scale: 0.98, x: -2 }}
                  className="rounded-xl px-4 py-3 text-left text-base font-semibold text-slate-100 transition hover:bg-slate-800/40 hover:text-white"
                >
                  {link.label}
                </motion.button>
              ))}
              <div className="mt-2 flex flex-col gap-2.5">
                {isAuthenticated ? (
                  onLogout && (
                    <motion.button
                      onClick={() => activate(onLogout)}
                      whileTap={{ scale: 0.98 }}
                      className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-base font-semibold text-slate-200 backdrop-blur-md"
                    >
                      Log out
                    </motion.button>
                  )
                ) : (
                  <motion.button
                    onClick={() => activate(onGetStarted, "Get Started")}
                    whileTap={{ scale: 0.98 }}
                    className="rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 px-4 py-3 text-base font-extrabold text-slate-950 border border-cyan-300/40 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                  >
                    Get Started
                  </motion.button>
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
