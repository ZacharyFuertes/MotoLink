import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import AccessDenied from "../components/AccessDenied";
import AddMechanicModal from "../components/AddMechanicModal";
import { Users } from "lucide-react";

interface SettingsPageProps {
  onNavigate?: (page: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [showInviteModal, setShowInviteModal] = useState(false);

  if (!user || user.role !== "owner") {
    return <AccessDenied requestedPage="settings" onNavigate={onNavigate} />;
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <h1 className="text-4xl font-bold text-white mb-1">System Settings</h1>
        <p className="text-slate-400 mb-10">
          Owner-only system configuration and monitoring.
        </p>

        {/* Settings cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
          <motion.div
            whileHover={{ y: -4 }}
            className="bg-slate-800 p-6 rounded-xl border border-slate-700 hover:border-blue-500/60 cursor-pointer transition-colors"
            onClick={() => setShowInviteModal(true)}
          >
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center mb-4">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Staff Management</h3>
            <p className="text-slate-400 text-sm">
              Invite mechanics to join the system and manage their access.
            </p>
          </motion.div>
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
