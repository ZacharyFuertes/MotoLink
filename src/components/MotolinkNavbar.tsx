import { Menu, X, LogOut } from "lucide-react";
import { useState } from "react";
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
  const links = [
    { label: "Find a Shop", action: onBrowse },
    { label: "Map", action: onMap },
    { label: "About", action: onAbout },
    { label: "My Appointments", action: isAuthenticated ? onAppointments : onGetStarted },
  ];
  const activate = (action: () => void) => { action(); setMenuOpen(false); };

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-moto-gray bg-moto-darker/95 backdrop-blur-md">
      <div className="mx-auto flex h-20 sm:h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center text-left">
          <img src={motolinkLogo} alt="Motolink Autoshop Clientele" className="h-14 sm:h-20 w-auto object-contain" />
        </button>
        <nav className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <button key={link.label} onClick={link.action} className="text-sm font-semibold text-slate-200 hover:text-moto-accent whitespace-nowrap transition">
              {link.label}
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <>
              {onLogout && (
                <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-moto-gray px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-moto-gray hover:text-white whitespace-nowrap">
                  <LogOut size={16} /> Log out
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={onGetStarted} className="rounded-xl bg-moto-accent px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-moto-accent-dark whitespace-nowrap shadow-lg shadow-moto-accent/25">
                Get Started
              </button>
            </>
          )}
        </div>
        <button onClick={() => setMenuOpen((value) => !value)} className="rounded-xl p-2.5 text-slate-100 border border-slate-800 bg-slate-900 md:hidden" aria-label="Toggle navigation">
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {menuOpen && (
        <div className="border-t border-moto-gray bg-moto-darker px-5 py-5 md:hidden shadow-2xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-2.5">
            {links.map((link) => (
              <button key={link.label} onClick={() => activate(link.action)} className="rounded-xl px-4 py-3 text-left text-base font-bold text-slate-100 hover:text-moto-accent hover:bg-slate-900 transition">
                {link.label}
              </button>
            ))}
            {isAuthenticated ? (
              <>
                {onLogout && (
                  <button onClick={() => activate(onLogout)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-moto-gray px-4 py-3 text-base font-bold text-slate-200 hover:bg-moto-gray">
                    <LogOut size={18} /> Log out
                  </button>
                )}
              </>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                <button onClick={() => activate(onGetStarted)} className="rounded-xl bg-moto-accent px-4 py-3 text-base font-extrabold text-slate-950 shadow-md">
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default MotolinkNavbar;