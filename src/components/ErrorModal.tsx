import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ErrorModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
  onTryAgain?: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  title = "Authentication Error",
  message,
  onClose,
  onTryAgain,
}) => {
  const modalContent = isOpen ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white border border-slate-200 border-t-2 border-t-slate-900 w-full max-w-sm overflow-hidden flex flex-col shadow-xl relative rounded-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-900" />
            <h3 className="font-display font-bold text-slate-900 uppercase text-xs tracking-widest">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-500 text-sm leading-relaxed mb-6 font-medium text-center">
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onTryAgain || onClose}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 uppercase tracking-widest text-[10px] transition border border-slate-900 rounded-lg"
            >
              Try Again
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-bold py-3 uppercase tracking-widest text-[10px] border border-slate-300 rounded-lg transition"
            >
              Close
            </button>
          </div>

          {/* Footer Links */}
          <div className="mt-5 text-center border-t border-slate-100 pt-4">
            <button
              onClick={() =>
                alert("Password reset functionality would open here.")
              }
              className="text-slate-500 hover:text-slate-900 text-[10px] uppercase tracking-widest font-bold transition"
            >
              Forgot Password?
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  ) : null;

  return modalContent;
};

export default ErrorModal;
