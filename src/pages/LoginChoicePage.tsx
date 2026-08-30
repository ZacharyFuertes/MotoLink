import React from "react";
import { motion } from "framer-motion";
import { Users, Store, ShieldCheck, Wrench, Lock, ChevronRight, Home } from "lucide-react";
import motolinkLogo from "../../public/favicon.svg";

interface LoginChoicePageProps {
  onChooseCustomer: () => void;
  onChooseOwner: () => void;
  onChooseAdmin: () => void;
  onChooseRegister: () => void;
  onBack: () => void;
}

// Shared glass portal card shell.
const glassCard =
  "group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/50 backdrop-blur-lg p-8 text-left text-slate-100 transition-all duration-300 hover:-translate-y-1";

const LoginChoicePage: React.FC<LoginChoicePageProps> = ({
  onChooseCustomer,
  onChooseOwner,
  onChooseAdmin,
  onChooseRegister,
  onBack,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-x-hidden">
      {/* Ambient cyan-and-crimson radial glow behind the centered content */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-950/30 from-30% via-slate-950 to-slate-950" />

      {/* Ultra-faint technical grid overlay */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      {/* Full-width translucent glass header */}
      <header className="fixed inset-x-0 top-0 z-40 w-full border-b border-slate-800/60 bg-slate-900/20 px-8 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <motion.button
            onClick={onBack}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ x: -4 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-100"
          >
            <Home size={16} />
            <span className="hidden sm:inline">Home</span>
          </motion.button>

          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            </span>
            System Online
          </span>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-5xl mt-20 sm:mt-16"
      >
        {/* Brand / hero */}
        <div className="text-center mb-12">
          <div className="mx-auto mb-5 flex h-24 w-80 max-w-full items-center justify-center drop-shadow-[0_0_35px_rgba(34,211,238,0.35)]">
            <motion.img
              src={motolinkLogo}
              alt="Motolink Autoshop Clientele logo"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", damping: 14 }}
              className="h-full w-auto object-contain"
            />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="font-display text-4xl sm:text-5xl uppercase tracking-wide text-white"
          >
            Select your portal
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="mt-3 text-sm font-medium tracking-wide text-slate-400"
          >
            Choose how you'd like to sign in to MotoLink — riders and shop teams each get a tailored experience.
          </motion.p>
        </div>

        {/* Portal cards — all access levels on equal footing */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* CUSTOMER */}
          <motion.button
            onClick={onChooseCustomer}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`${glassCard} hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/10`}
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative z-10">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.25)] transition-transform duration-300 group-hover:scale-110">
                <Users size={30} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Customer</h3>
              <p className="text-sm text-slate-400 mb-6">
                Book appointments and track repairs
              </p>
              <div className="flex items-center gap-2 text-cyan-400 font-semibold transition-transform duration-300 group-hover:translate-x-1">
                <span className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950">
                  Login
                </span>
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
          </motion.button>

          {/* SHOP OWNER */}
          <motion.button
            onClick={onChooseOwner}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`${glassCard} hover:border-orange-500/50 hover:shadow-2xl hover:shadow-orange-500/10`}
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange-500/10 blur-3xl" />
            <div className="relative z-10">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.25)] transition-transform duration-300 group-hover:scale-110">
                <Store size={30} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Shop Owner</h3>
              <p className="text-sm text-slate-400 mb-6">
                Own a shop, or manage the platform
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white">
                  Login
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChooseRegister();
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 transition hover:bg-white/5 hover:text-white"
                >
                  Register shop
                </button>
              </div>
            </div>
          </motion.button>

          {/* PLATFORM ADMIN */}
          <motion.button
            onClick={onChooseAdmin}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`${glassCard} hover:border-rose-500/50 hover:shadow-2xl hover:shadow-rose-500/10`}
          >
            <span className="absolute right-5 top-5 z-20 inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Lock size={10} /> Restricted
            </span>
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-rose-500/10 blur-3xl" />
            <div className="relative z-10">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.25)] transition-transform duration-300 group-hover:scale-110">
                <ShieldCheck size={30} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Platform Admin</h3>
              <p className="text-sm text-slate-400 mb-6">
                Manage the MotoLink platform
              </p>
              <div className="flex items-center gap-2 text-rose-400 font-semibold transition-transform duration-300 group-hover:translate-x-1">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 border border-rose-500/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-300">
                  <Wrench size={13} /> Login
                </span>
                <ChevronRight className="h-5 w-5" />
              </div>
            </div>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginChoicePage;
