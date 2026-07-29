import React from "react";
import { motion } from "framer-motion";
import { Users, Wrench, Building2, ChevronRight, Home } from "lucide-react";
import motolinkLogo from "../pictures/public/motolink.svg";

interface LoginChoicePageProps {
  onChooseCustomer: () => void;
  onChooseMechanic: () => void;
  onChooseOwner: () => void;
  onBack: () => void;
}

const LoginChoicePage: React.FC<LoginChoicePageProps> = ({
  onChooseCustomer,
  onChooseMechanic,
  onChooseOwner,
  onBack,
}) => {
  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      {/* Home Button */}
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
        {/* Header */}
        <div className="text-center mb-12">
          <motion.img
            src={motolinkLogo}
            alt="Motolink Autoshop Clientele logo"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1 }}
            className="h-20 w-60 object-contain mx-auto mb-4 sm:w-72"
          />
          <h1 className="text-4xl font-bold text-white mb-2">MOTOLINK AUTOSHOP CLIENTELE</h1>
          <p className="text-slate-400">Select your portal</p>
        </div>

        {/* Login Options */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Customer Login */}
          <motion.button
            onClick={onChooseCustomer}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="group relative p-8 bg-black border-2 border-zinc-800 hover:border-green-500 rounded-xl overflow-hidden transition-all"
          >
            {/* Background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Content */}
            <div className="relative z-10">
              <motion.div className="w-16 h-16 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-green-500/30 transition">
                <Users className="w-8 h-8 text-green-500" />
              </motion.div>

              <h3 className="text-xl font-bold text-white mb-2">Customer</h3>
              <p className="text-slate-400 text-sm mb-6">
                Book appointments and track repairs
              </p>

              <div className="flex items-center justify-center gap-2 text-green-500 font-semibold group-hover:gap-3 transition-all">
                Login
                <ChevronRight className="w-5 h-5" />
              </div>
            </div>
          </motion.button>

          {/* Mechanic Login */}
          <motion.button
            onClick={onChooseMechanic}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="group relative p-8 bg-black border-2 border-zinc-800 hover:border-blue-500 rounded-xl overflow-hidden transition-all"
          >
            {/* Background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Content */}
            <div className="relative z-10">
              <motion.div className="w-16 h-16 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/30 transition">
                <Wrench className="w-8 h-8 text-blue-500" />
              </motion.div>

              <h3 className="text-xl font-bold text-white mb-2">Mechanic</h3>
              <p className="text-slate-400 text-sm mb-6">
                Manage assigned jobs and repairs
              </p>

              <div className="flex items-center justify-center gap-2 text-blue-500 font-semibold group-hover:gap-3 transition-all">
                Login
                <ChevronRight className="w-5 h-5" />
              </div>
            </div>
          </motion.button>

          {/* Owner/Admin Login */}
          <motion.button
            onClick={onChooseOwner}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="group relative p-8 bg-black border-2 border-zinc-800 hover:border-red-500 rounded-xl overflow-hidden transition-all"
          >
            {/* Background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Content */}
            <div className="relative z-10">
              <motion.div className="w-16 h-16 bg-red-500/20 rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:bg-red-500/30 transition">
                <Building2 className="w-8 h-8 text-red-500" />
              </motion.div>

              <h3 className="text-xl font-bold text-white mb-2">Owner/Admin</h3>
              <p className="text-slate-400 text-sm mb-6">
                Manage shop and all operations
              </p>

              <div className="flex items-center justify-center gap-2 text-red-500 font-semibold group-hover:gap-3 transition-all">
                Login
                <ChevronRight className="w-5 h-5" />
              </div>
            </div>
          </motion.button>
        </div>

        {/* Back Button */}
      </motion.div>
    </div>
  );
};

export default LoginChoicePage;
