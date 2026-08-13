import { Menu, X, LogOut } from "lucide-react";
import { useState } from "react";
import motolinkLogo from "../pictures/public/motolink-new-logo.svg";

interface MotolinkNavbarProps {
  isAuthenticated: boolean;
  onBrowse: () => void;
  onMap: () => void;
  onAbout: () => void;
  onLogin: () => void;
  onSignup: () => void;
  onLogout?: () => void;
}

const MotolinkNavbar = ({ isAuthenticated, onBrowse, onMap, onAbout, onLogin, onSignup, onLogout }: MotolinkNavbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [{ label: "Browse shops", action: onBrowse }, { label: "Map", action: onMap }, { label: "About", action: onAbout }];
  const activate = (action: () => void) => { action(); setMenuOpen(false); };

  return <header className="fixed inset-x-0 top-0 z-40 border-b border-moto-gray bg-moto-darker/95 backdrop-blur-sm">
    <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center text-left"><img src={motolinkLogo} alt="Motolink Autoshop Clientele" className="h-[4.75rem] w-auto object-contain sm:h-[5.5rem]" /></button>
      <nav className="hidden items-center gap-7 md:flex">{links.map((link) => <button key={link.label} onClick={link.action} className="text-sm font-medium text-slate-200 hover:text-red-400 whitespace-nowrap">{link.label}</button>)}</nav>
      <div className="hidden items-center gap-3 md:flex">{isAuthenticated ? <>
              {onLogout && <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-moto-gray px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-moto-gray hover:text-white whitespace-nowrap"><LogOut size={16} /> Log out</button>}
            </> : <><button onClick={onSignup} className="rounded-xl bg-moto-accent px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-moto-dark whitespace-nowrap">Register</button><button onClick={onLogin} className="rounded-xl bg-moto-accent px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-moto-dark whitespace-nowrap">Log in</button></>}</div>
      <button onClick={() => setMenuOpen((value) => !value)} className="rounded-lg p-2 text-slate-200 md:hidden" aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
    </div>
    {menuOpen && <div className="border-t border-moto-gray bg-moto-darker px-4 py-4 md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-2">{links.map((link) => <button key={link.label} onClick={() => activate(link.action)} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-200 hover:text-red-400 hover:bg-moto-gray">{link.label}</button>)}{isAuthenticated ? <>
      {onLogout && <button onClick={() => activate(onLogout)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-moto-gray px-3 py-2.5 text-sm font-semibold text-slate-200 hover:bg-moto-gray"><LogOut size={16} /> Log out</button>}
    </> : <button onClick={() => activate(onLogin)} className="mt-2 rounded-lg bg-moto-accent px-3 py-2.5 text-sm font-semibold text-slate-950">Log in or register</button>}</div></div>}
  </header>;
};

export default MotolinkNavbar;
