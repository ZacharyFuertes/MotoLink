/**
 * ReceiptModal.tsx
 * Displays service booking receipt with mechanic info and appointment date
 */
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Wrench, Calendar, Clock, User } from "lucide-react";

interface ReceiptData {
  id: string;
  booking_id?: string;
  customer_id: string;
  service_type: string;
  scheduled_date: string;
  scheduled_time: string;
  mechanic_id?: string;
  mechanic_name?: string;
  status: string;
  parts?: any[];
  total_amount?: number;
  created_at: string;
  notes?: string;
}

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: ReceiptData | null;
}

const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  receipt,
}) => {
  if (!isOpen || !receipt) return null;

  const appointmentDate = new Date(receipt.scheduled_date);
  const formattedDate = appointmentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalPartsPrice = (receipt.parts || []).reduce(
    (sum: number, part: any) => sum + (part.unit_price * part.quantity || 0),
    0,
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-3 z-50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl border border-slate-200 border-t-2 border-t-slate-900 w-full sm:max-w-[1100px] h-[95vh] sm:h-auto sm:max-h-[94vh] overflow-hidden shadow-xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 sm:px-10 py-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-green-600 flex items-center justify-center shrink-0">
                <CheckCircle
                  size={28}
                  className="text-white"
                  strokeWidth={1.5}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 text-slate-900 text-[10px] font-bold tracking-[0.2em] uppercase">
                  <div className="w-6 h-[1px] bg-slate-900" /> SERVICE RECEIPT
                </div>
                <h2 className="font-display text-3xl sm:text-4xl text-slate-900 uppercase leading-none tracking-wide">
                  APPOINTMENT CONFIRMED
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 border border-slate-300 hover:bg-slate-100 transition text-slate-500 hover:text-slate-900 shrink-0"
            >
              <X size={20} strokeWidth={1} />
            </button>
          </div>

          {/* Receipt Content */}
          <div
            id="receipt-content"
            className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 bg-white"
          >
            <div className="max-w-4xl mx-auto">
              {/* Receipt Number */}
              <div className="text-center mb-8 pb-8 border-b border-slate-200">
                <p className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase mb-2">
                  Receipt Number
                </p>
                <p className="font-display text-2xl text-slate-900 uppercase tracking-wide">
                  {receipt.booking_id
                    ? receipt.booking_id
                    : `#${receipt.id.substring(0, 8).toUpperCase()}`}
                </p>
                <p className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase mt-2">
                  Created: {new Date(receipt.created_at).toLocaleDateString()}
                </p>
              </div>

              {/* Main Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8 pb-8 border-b border-slate-200">
                {/* Service Details */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-900 uppercase mb-4">
                    SERVICE DETAILS
                  </h3>
                  <div className="flex items-start gap-3">
                    <Wrench
                      size={20}
                      className="text-slate-900 mt-1 flex-shrink-0"
                    />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                        Service Type
                      </p>
                      <p className="text-slate-900 font-bold text-lg">
                        {receipt.service_type.replace(/_/g, " ").toUpperCase()}
                      </p>
                    </div>
                  </div>
                  {receipt.notes && (
                    <div className="bg-slate-100 border border-slate-200 p-3 rounded-xl">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                        Notes
                      </p>
                      <p className="text-slate-400 text-sm">{receipt.notes}</p>
                    </div>
                  )}
                </div>

                {/* Appointment Details */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-900 uppercase mb-4">
                    APPOINTMENT DETAILS
                  </h3>
                  <div className="flex items-start gap-3">
                    <Calendar
                      size={20}
                      className="text-green-600 mt-1 flex-shrink-0"
                    />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                        Appointment Date
                      </p>
                      <p className="text-slate-900 font-bold">{formattedDate}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock
                      size={20}
                      className="text-green-600 mt-1 flex-shrink-0"
                    />
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                        Appointment Time
                      </p>
                      <p className="text-slate-900 font-bold">
                        {receipt.scheduled_time}
                      </p>
                    </div>
                  </div>
                  {receipt.mechanic_name && (
                    <div className="flex items-start gap-3">
                      <User
                        size={20}
                        className="text-green-600 mt-1 flex-shrink-0"
                      />
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                          Assigned Mechanic
                        </p>
                        <p className="text-slate-900 font-bold">
                          {receipt.mechanic_name}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Parts List (if any) */}
              {receipt.parts && receipt.parts.length > 0 && (
                <div className="mb-8 pb-8 border-b border-slate-200">
                  <h3 className="text-[10px] font-bold tracking-[0.2em] text-slate-900 uppercase mb-4">
                    PARTS INCLUDED
                  </h3>
                  <div className="space-y-2">
                    {receipt.parts.map((part, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-100 border border-slate-200 p-4 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-slate-900 font-bold">
                            {part.part_name}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            SKU: {part.part_id}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-900 font-bold">
                            {part.quantity}x @ ₱
                            {part.unit_price.toLocaleString()}
                          </p>
                          <p className="text-green-600 font-display font-black">
                            ₱
                            {(part.quantity * part.unit_price).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total Summary */}
              <div className="space-y-4 bg-slate-100 border border-slate-200 p-6 rounded-xl">
                {receipt.parts && receipt.parts.length > 0 && (
                  <div className="flex items-center justify-between border-b border-slate-300 pb-4">
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">
                      Parts Total
                    </p>
                    <p className="text-slate-900 font-bold text-lg">
                      ₱{totalPartsPrice.toLocaleString()}
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-4 border-t border-slate-300">
                  <p className="text-slate-900 font-display font-black text-lg uppercase tracking-wide">
                    Total Amount
                  </p>
                  <p className="text-slate-900 font-display font-black text-3xl">
                    ₱{(receipt.total_amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="text-center mt-8 pt-8 border-t border-slate-200">
                <span className="inline-block bg-green-50 border border-green-600 text-green-600 text-[10px] font-bold px-4 py-2 tracking-widest uppercase">
                  ✓ {receipt.status.toUpperCase()}
                </span>
                <p className="text-slate-500 text-xs mt-4 tracking-wide">
                  Thank you for your business! Please bring this receipt to your
                  appointment.
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 sm:px-10 py-6 border-t border-slate-200 bg-slate-100 flex-shrink-0 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 font-bold uppercase tracking-widest transition rounded-xl"
            >
              CLOSE
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ReceiptModal;
