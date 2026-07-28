import { Menu, X } from "lucide-react";
import { useState } from "react";
import motolinkLogo from "../pictures/public/Motolink.svg";

interface MotolinkNavbarProps {
  isAuthenticated: boolean;
  onBrowse: () => void;
  onMap: () => void;
  onAbout: () => void;
  onLogin: () => void;
  onSignup: () => void;
}

const MotolinkNavbar = ({ isAuthenticated, onBrowse, onMap, onAbout, onLogin, onSignup }: MotolinkNavbarProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [{ label: "Browse shops", action: onBrowse }, { label: "Map", action: onMap }, { label: "About", action: onAbout }];
  const activate = (action: () => void) => { action(); setMenuOpen(false); };

  return <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-300/80 bg-[#fff9ed]/95 backdrop-blur">
    <div className="mx-auto flex h-[88px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center text-left"><img src={motolinkLogo} alt="Motolink Autoshop Clientele" className="h-20 w-auto object-contain object-left sm:h-24 lg:h-28" /></button>
      <nav className="hidden items-center gap-7 md:flex">{links.map((link) => <button key={link.label} onClick={link.action} className="text-sm font-medium text-slate-600 hover:text-slate-950">{link.label}</button>)}</nav>
      <div className="hidden items-center gap-3 md:flex">{isAuthenticated ? <button onClick={onBrowse} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Browse shops</button> : <><button onClick={onSignup} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">Register</button><button onClick={onLogin} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">Log in</button></>}</div>
      <button onClick={() => setMenuOpen((value) => !value)} className="rounded-lg p-2 text-slate-700 md:hidden" aria-label="Toggle navigation">{menuOpen ? <X /> : <Menu />}</button>
    </div>
    {menuOpen && <div className="border-t border-slate-200 bg-[#fff9ed] px-4 py-4 md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-2">{links.map((link) => <button key={link.label} onClick={() => activate(link.action)} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-[#f3ead9]">{link.label}</button>)}<button onClick={() => activate(isAuthenticated ? onBrowse : onLogin)} className="mt-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white">{isAuthenticated ? "Browse shops" : "Log in or register"}</button></div></div>}
  </header>;
};

export default MotolinkNavbar;
