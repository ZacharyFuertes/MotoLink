import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, X, Mail, Globe } from "lucide-react";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LAST_UPDATED = "September 26, 2026";

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Account Registration & User Information",
    body: "Eligibility: You must be at least 18 years old or the age of majority in your jurisdiction to create an account.\n\nAccount Security: You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.\n\nConsent to Data Access & Use: By registering and submitting information (including personal details, vehicle history, service requests, and maintenance records) through MotoLink, you explicitly grant MotoLink a worldwide, non-exclusive, royalty-free license to collect, store, process, display, and use the data provided to operate, deliver, and improve our services, facilitate appointments, and communicate with service providers.",
  },
  {
    heading: "Client-to-Customer Service Agreement",
    body: "MotoLink acts as a digital platform connecting customers with auto shops, technicians, or service providers (\"Service Providers\").\n\nService Requests: When you request a quote, schedule a service, or book a repair via MotoLink, a direct agreement for services is formed between you and the designated Service Provider.\n\nAccuracy of Vehicle Information: You are responsible for ensuring that all vehicle specifications, diagnostic descriptions, and histories provided during signup or booking are accurate.\n\nIndependent Contractors: MotoLink is not an employer, partner, or agent of the third-party Service Providers using the platform. Service Providers operate independently, and MotoLink does not directly execute vehicle repair work unless explicitly stated.",
  },
  {
    heading: "Payments, Cancellations, and Refunds",
    body: "Pricing: Prices for services, diagnostics, or parts listed on the website are subject to confirmation by the Service Provider.\n\nPayment Terms: You agree to pay all charges incurred under your account in accordance with the rates and terms in effect at the time of booking or service completion.\n\nCancellations & Missed Appointments: Late cancellations, no-shows, or reschedules may be subject to cancellation fees as determined by the platform or participating Service Provider policies.",
  },
  {
    heading: "Acceptable Use Policy",
    body: "When using MotoLink, you agree not to:\n\n• Provide false, inaccurate, or misleading vehicle or personal information.\n\n• Use the platform for fraudulent service requests or unlawful purposes.\n\n• Interfere with or disrupt the website's security, servers, API integrations, or network infrastructure.\n\n• Attempt to reverse-engineer, decompile, or copy any software or proprietary code from the platform.",
  },
  {
    heading: "Intellectual Property",
    body: "All content on MotoLink—including text, graphics, logos, user interface designs, software, branding, and dynamic features—is the property of MotoLink or its licensors and is protected by applicable intellectual property laws.",
  },
  {
    heading: "Disclaimer of Warranties & Limitation of Liability",
    body: "\"As-Is\" Basis: MotoLink is provided on an \"as-is\" and \"as-available\" basis without warranties of any kind, either express or implied, including fitness for a particular purpose or non-infringement.\n\nLimitation of Liability: To the maximum extent permitted by law, MotoLink shall not be liable for any indirect, incidental, consequential, or punitive damages, including vehicle damage, personal injury, loss of data, or service delays arising out of your use of the platform or services rendered by third-party Service Providers.",
  },
  {
    heading: "Account Termination",
    body: "We reserve the right to suspend or terminate your access to MotoLink at our sole discretion, without prior notice, if you breach these Terms or engage in conduct harmful to the platform, other users, or Service Providers.",
  },
  {
    heading: "Changes to These Terms",
    body: "MotoLink reserves the right to update or modify these Terms at any time. We will notify users of material changes via email or a notice on the platform. Your continued use of the website following any changes constitutes acceptance of the new Terms.",
  },
  {
    heading: "Governing Law & Dispute Resolution",
    body: "These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which MotoLink operates, without regard to its conflict of law principles. Any disputes arising under these Terms shall be resolved through binding arbitration or appropriate local courts.",
  },
  {
    heading: "Contact Us",
    body: "If you have questions or concerns regarding these Terms and Conditions, please contact us at:",
  },
];

/**
 * TermsModal Component
 *
 * Popup that presents the MotoLink Terms & Conditions.
 * Features:
 * - Dark charcoal card matching the site theme
 * - Scrollable body for the full legal document
 * - Closes via backdrop click, X button, or Escape
 * - Locks page scroll while open
 */
const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose }) => {
  // Close on Escape and lock page scroll while the modal is open.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-modal-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 30 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-moto-darker border border-moto-gray rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-moto-gray bg-moto-dark/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-moto-accent/15 border border-moto-accent/30 flex items-center justify-center shrink-0 rounded-xl">
                  <FileText size={22} className="text-moto-accent" strokeWidth={1.5} />
                </div>
                <div>
                  <h2
                    id="terms-modal-title"
                    className="text-lg font-bold text-slate-100 tracking-tight"
                  >
                    Terms and Conditions
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Last Updated: {LAST_UPDATED}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-moto-accent transition-colors shrink-0"
                title="Close"
                aria-label="Close terms and conditions"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-6 overflow-y-auto flex-1">
              <p className="text-sm text-slate-300 leading-relaxed mb-8">
                Welcome to MotoLink ("Company," "we," "our," or "us"). By
                creating an account, accessing, or using our website and
                services, you agree to be bound by these Terms and Conditions
                ("Terms"). Please read them carefully.
              </p>

              <div className="space-y-7">
                {SECTIONS.map((section, idx) => (
                  <section key={section.heading}>
                    <h3 className="flex items-start gap-3 text-sm font-bold text-moto-accent mb-2">
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-moto-accent/20 text-[10px] font-black text-moto-accent">
                        {idx + 1}
                      </span>
                      <span>{section.heading}</span>
                    </h3>
                    {section.body.split("\n\n").map((paragraph, pIdx) => (
                      <p
                        key={pIdx}
                        className="text-sm text-slate-400 leading-relaxed pl-8"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </section>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-moto-gray bg-moto-dark/60 shrink-0">
              <p className="text-xs font-semibold text-slate-300 mb-3">
                Questions about these terms? Reach us at:
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                <a
                  href="mailto:support@motolink.com"
                  className="inline-flex items-center gap-2 text-xs text-moto-accent hover:underline"
                >
                  <Mail size={14} /> support@motolink.com
                </a>
                <a
                  href="https://moto-link-rho.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-moto-accent hover:underline"
                >
                  <Globe size={14} />{" "}
                  https://moto-link-rho.vercel.app
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TermsModal;
