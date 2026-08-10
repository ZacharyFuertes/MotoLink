import React from "react";
import { AlertCircle, X } from "lucide-react";

interface InlineErrorProps {
  message: string;
  onClose?: () => void;
}

const InlineError: React.FC<InlineErrorProps> = ({ message, onClose }) => {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed">{message}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss error"
          className="text-red-400 hover:text-red-600 transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default InlineError;
