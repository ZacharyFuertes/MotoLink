import React from "react";
import { motion } from "framer-motion";
import { Users, Store, ShieldCheck, Lock, ChevronRight, Home } from "lucide-react";
import motolinkLogo from "../pictures/public/motolink-new-logo.svg";

interface LoginChoicePageProps {
  onChooseCustomer: () => void;
  onChooseOwner: () => void;
  onChooseAdmin: () => void;
  onChooseRegister: () => void;
  onBack: () => void;
}

const cardClass =
  "group relative p-8 bg-moto-darker border border-moto-gray hover:border-moto-accent hover:shadow-[0_0_0_1px_rgba(248,113,113,0.25)] rounded-xl overflow-hidden transition-all text-left text-slate-100";
const iconTileClass =
  "w-16 h-16 bg-moto-dark rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-moto-accent/10 transition";
const iconClass = "w-8 h-8 text-moto-accent";

const LoginChoicePage: React.FC<LoginChoicePageProps> = ({
  onChooseCustomer,
  onChooseOwner,
  onChooseAdmin,
  onChooseRegister,
  onBack,
}) => (
  <div className="min-h-screen bg-moto-dark flex items-center justify-center p-4 text-slate-100">
    <motion.button
      onClick={onBack}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed top-6 left-6 flex items-center gap-2 px-4 py-2 bg-moto-accent hover:bg-moto-dark border border-moto-accent rounded-xl text-slate-950 shadow-sm transition"
      whileHover={{ scale: 1.05, x: -4 }}
    >
      <Home size={18} />
      <span className="hidden sm:inline text-sm font-semibold">Home</span>
    </motion.button>

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-4xl"
    >
      <div className="text-center mb-12">
        <div className="mx-auto mb-6 flex h-32 w-[36rem] max-w-full items-center justify-center overflow-hidden">
          <motion.img
            src={motolinkLogo}
            alt="Motolink Autoshop Clientele logo"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
            className="h-full w-auto object-contain"
          />
        </div>
        <p className="text-slate-300 font-medium">Select your portal</p>
      </div>

      {/* PUBLIC ACCESS */}
      <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-3">
        Public access
      </p>
      <div className="grid grid-cols-1 gap-6 mb-10 max-w-md mx-auto">
        <motion.button
          onClick={onChooseCustomer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cardClass}
        >
          <div className="relative z-10">
            <div className={iconTileClass}>
              <Users className={iconClass} />
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Customer</h3>
            <p className="text-slate-300 text-sm mb-6">
              Book appointments and track repairs
            </p>
            <div className="flex items-center gap-2 text-moto-accent font-semibold group-hover:gap-3 transition-all">
              Login
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </motion.button>
      </div>

      {/* BUSINESS AND ADMIN — VERIFIED ACCESS */}
      <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-3">
        Business and admin — verified access
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={cardClass}
        >
          <span className="absolute top-4 right-4 flex items-center gap-1 text-[11px] text-slate-400">
            <Lock size={12} /> Secured
          </span>
          <div className="relative z-10">
            <div className={iconTileClass}>
              <Store className={iconClass} />
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Shop Owner</h3>
            <p className="text-slate-300 text-sm mb-6">
              Manage your shop and all operations
            </p>
            <div className="flex gap-3">
              <button
                onClick={onChooseOwner}
                className="flex-1 px-4 py-2.5 bg-moto-accent hover:bg-moto-dark text-slate-950 hover:text-white text-sm font-semibold rounded-lg transition"
              >
                Log in
              </button>
              <button
                onClick={onChooseRegister}
                className="flex-1 px-4 py-2.5 border border-moto-gray hover:bg-moto-accent/10 text-slate-200 text-sm font-semibold rounded-lg transition"
              >
                Register shop
              </button>
            </div>
          </div>
        </motion.div>

        <motion.button
          onClick={onChooseAdmin}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cardClass}
        >
          <span className="absolute top-4 right-4 flex items-center gap-1 text-[11px] text-slate-400">
            <Lock size={12} /> Restricted
          </span>
          <div className="relative z-10">
            <div className={iconTileClass}>
              <ShieldCheck className={iconClass} />
            </div>
            <h3 className="text-xl font-bold text-slate-100 mb-2">Platform Admin</h3>
            <p className="text-slate-300 text-sm mb-6">
              Manage the MotoLink platform
            </p>
            <div className="flex items-center gap-2 text-moto-accent font-semibold group-hover:gap-3 transition-all">
              Login
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </motion.button>
      </div>
    </motion.div>
  </div>
);

export default LoginChoicePage;
