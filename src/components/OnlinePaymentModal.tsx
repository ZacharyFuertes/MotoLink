import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  X,
  Wallet,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Clock,
} from "lucide-react";
import { getPaymentStatus, CreatedOnlinePayment } from "../services/paymentService";

interface OnlinePaymentModalProps {
  isOpen: boolean;
  /** A REAL PayMongo checkout already created server-side. `null` = never render a QR. */
  payment: CreatedOnlinePayment | null;
  onClose: () => void;
  onPaid?: () => void;
}

const methodLabel = (method: string) => (method === "gcash" ? "GCash" : "Maya");

const OnlinePaymentModal: React.FC<OnlinePaymentModalProps> = ({
  isOpen,
  payment,
  onClose,
  onPaid,
}) => {
  const [paid, setPaid] = useState(false);
  const [polling, setPolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRealQr = Boolean(payment?.qrValue);

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setPaid(false);
      return;
    }

    if (!payment || !hasRealQr) {
      stopPolling();
      return;
    }

    // Start polling the server function; the webhook flips status to paid.
    setPolling(true);
    const poll = async () => {
      const result = await getPaymentStatus(payment.id);
      if (result?.status === "paid") {
        stopPolling();
        setPaid(true);
        setPolling(false);
        onPaid?.();
      } else if (result?.status === "failed" || result?.status === "expired") {
        stopPolling();
        setPolling(false);
      }
    };
    poll();
    timerRef.current = setInterval(poll, 3000);

    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, payment?.id]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 z-[60]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="bg-white rounded-2xl w-full max-w-md overflow-hidden border border-slate-200 shadow-2xl shadow-black/20"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 flex items-center justify-center">
                  <Wallet size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-cyan-600 uppercase">
                    Online Payment
                  </p>
                  <h2 className="font-display font-black text-lg text-slate-900 leading-none mt-0.5">
                    {paid ? "Payment Received" : "Scan to Pay"}
                  </h2>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Close payment"
                className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              >
                <X size={18} strokeWidth={1.75} />
              </motion.button>
            </div>

            <div className="px-6 py-6">
              {paid ? (
                <div className="text-center py-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 16 }}
                    className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center rounded-full mb-4"
                  >
                    <CheckCircle size={30} className="text-emerald-500" strokeWidth={1.5} />
                  </motion.div>
                  <h3 className="font-bold text-slate-900 text-lg mb-1">
                    Your downpayment is confirmed
                  </h3>
                  <p className="text-slate-500 text-sm">
                    {payment?.amount !== undefined
                      ? `₱${Number(payment.amount).toLocaleString()} received via ${methodLabel(payment?.method || "")}.`
                      : "Thank you for paying online."}
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition"
                  >
                    DONE
                  </button>
                </div>
              ) : !hasRealQr || !payment ? (
                // Guard: no real PayMongo QR — never render a placeholder.
                <div className="text-center py-8">
                  <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                    <AlertTriangle size={26} className="text-amber-500" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base mb-1">
                    Online payment isn't available
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    This shop hasn't enabled online payments, or the payment
                    couldn't be started. Please pay at the shop counter instead —
                    your booking is still confirmed.
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-5 px-8 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-cyan-500/10 text-cyan-700 text-sm font-bold">
                    <Clock size={15} />
                    Pay {methodLabel(payment.method)} downpayment of{" "}
                    <span className="font-black">
                      ₱{Number(payment.amount).toLocaleString()}
                    </span>
                  </div>
                  <div className="inline-flex p-4 border-2 border-slate-900 rounded-2xl bg-white">
                    <QRCodeSVG value={payment.qrValue} size={220} level="M" marginSize={2} />
                  </div>
                  <p className="text-slate-500 text-sm mt-5 max-w-xs mx-auto leading-relaxed">
                    Open your {methodLabel(payment.method)} app, scan this QR and
                    complete the payment. It's verified automatically once the
                    payment goes through.
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-5">
                    {polling ? (
                      <span className="inline-flex items-center gap-2 text-xs text-slate-400 font-semibold">
                        <Loader2 size={14} className="animate-spin" />
                        Waiting for payment...
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-xs text-slate-500 font-semibold">
                        <CheckCircle size={13} />
                        Payment verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-4">
                    Your booking is saved. If you'd rather not pay now, close this
                    screen and pay at the shop.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnlinePaymentModal;