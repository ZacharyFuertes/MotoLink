import React from "react";
import { motion } from "framer-motion";
import { Users, Wrench, Store, ShieldCheck, Lock, ChevronRight, Home } from "lucide-react";
import motolinkLogo from "../pictures/public/motolink.svg";

interface LoginChoicePageProps {
  onChooseCustomer: () => void;
  onChooseMechanic: () => void;
  onChooseOwner: () => void;
  onChooseAdmin: () => void;
  onChooseRegister: () => void;
  onBack: () => void;
}

const cardClass =
  "group relative p-8 bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-lg rounded-xl overflow-hidden transition-all text-left";
const iconTileClass =
  "w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-slate-200 transition";
const iconClass = "w-8 h-8 text-slate-600";

const LoginChoicePage: React.FC<LoginChoicePageProps> = ({
  onChooseCustomer,
  onChooseMechanic,
  onChooseOwner,
  onChooseAdmin,
  onChooseRegister,
  onBack,
}) => (
  <div className="min-h-screen bg-white flex items-center justify-center p-4">
    <motion.button
      onClick={onBack}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed top-6 left-6 flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition"
      whileHover={{ scale: 1.05, x: -4 }}
    >
      <Home size={18} />
      <span className="hidden sm:inline text-sm font-medium">Home</span>
    </motion.button>

    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-4xl"
    >
      <div className="text-center mb-12">
        <motion.img
          src={motolinkLogo}
          alt="Motolink Autoshop Clientele logo"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
          className="h-20 w-60 object-contain mx-auto mb-4 sm:w-72"
        />
        <h1 className="text-4xl font-bold text-slate-900 mb-2">MOTOLINK AUTOSHOP CLIENTELE</h1>
        <p className="text-slate-500">Select your portal</p>
      </div>

      {/* PUBLIC ACCESS */}
      <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-3">
        Public access
      </p>
      <div className="grid md:grid-cols-2 gap-6 mb-10">
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
            <h3 className="text-xl font-bold text-slate-900 mb-2">Customer</h3>
            <p className="text-slate-500 text-sm mb-6">
              Book appointments and track repairs
            </p>
            <div className="flex items-center gap-2 text-slate-600 font-semibold group-hover:gap-3 transition-all">
              Login
              <ChevronRight className="w-5 h-5" />
            </div>
          </div>
        </motion.button>

        <motion.button
          onClick={onChooseMechanic}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cardClass}
        >
          <div className="relative z-10">
            <div className={iconTileClass}>
              <Wrench className={iconClass} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Mechanic</h3>
            <p className="text-slate-500 text-sm mb-6">
              Manage assigned jobs and repairs
            </p>
            <div className="flex items-center gap-2 text-slate-600 font-semibold group-hover:gap-3 transition-all">
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
            <h3 className="text-xl font-bold text-slate-900 mb-2">Shop Owner</h3>
            <p className="text-slate-500 text-sm mb-6">
              Manage your shop and all operations
            </p>
            <div className="flex gap-3">
              <button
                onClick={onChooseOwner}
                className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition"
              >
                Log in
              </button>
              <button
                onClick={onChooseRegister}
                className="flex-1 px-4 py-2.5 border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg transition"
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
            <h3 className="text-xl font-bold text-slate-900 mb-2">Platform Admin</h3>
            <p className="text-slate-500 text-sm mb-6">
              Manage the MotoLink platform
            </p>
            <div className="flex items-center gap-2 text-slate-600 font-semibold group-hover:gap-3 transition-all">
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
