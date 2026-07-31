import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import AccessDenied from "../components/AccessDenied";
import AddMechanicModal from "../components/AddMechanicModal";
import { Users, Store } from "lucide-react";

interface SettingsPageProps {
  onNavigate?: (page: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);

  if (!user || (user.role !== "owner" && user.role !== "admin")) {
    return <AccessDenied requestedPage="settings" onNavigate={onNavigate} />;
  }

  const handleOpenShopSettings = () => {
    if (onNavigate) onNavigate("shop-settings");
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          System Settings
        </h1>
        <p className="text-slate-500 mb-10">
          Owner-only system configuration and monitoring.
        </p>

        {/* Settings cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
          <motion.div
            whileHover={{ y: -4 }}
            className="bg-white p-6 rounded-xl border border-slate-200 hover:border-violet-500/60 cursor-pointer transition-colors shadow-sm"
            onClick={() => setShowInviteModal(true)}
          >
            <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              Staff Management
            </h3>
            <p className="text-slate-500 text-sm">
              Invite mechanics to join the system and manage their access.
            </p>
          </motion.div>

          {user.role === "owner" && (
            <motion.div
              whileHover={{ y: -4 }}
              className="bg-white p-6 rounded-xl border border-slate-200 hover:border-violet-500/60 cursor-pointer transition-colors shadow-sm"
              onClick={handleOpenShopSettings}
            >
              <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-lg flex items-center justify-center mb-4">
                <Store size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                Shop Profile
              </h3>
              <p className="text-slate-500 text-sm">
                Edit the details customers see on the MotoLink landing page.
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>

      <AddMechanicModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  );
};

export default SettingsPage;
