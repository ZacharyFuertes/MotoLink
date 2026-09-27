import React from "react";
import { Check } from "lucide-react";

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Opens the page's existing TermsModal. */
  onOpenTerms: () => void;
  className?: string;
}

/**
 * Required agreement tickbox for the two registration flows (customer signup
 * and shop registration). Purely a client-side gate — the caller blocks its own
 * submit handler when `checked` is false, so the wording here is the single
 * source of truth for what the user is agreeing to.
 */
const TermsCheckbox: React.FC<TermsCheckboxProps> = ({
  checked,
  onChange,
  onOpenTerms,
  className = "",
}) => {
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-moto-accent/50 ${
          checked
            ? "border-moto-accent bg-moto-accent shadow-[0_0_10px_rgba(53,208,192,0.35)]"
            : "border-moto-gray bg-moto-dark/80 hover:border-moto-accent/50"
        }`}
      >
        {checked && (
          <Check size={13} strokeWidth={3.5} className="text-slate-950" />
        )}
      </button>

      <p className="text-xs leading-relaxed text-slate-400">
        I have read and agree to MotoLink's{" "}
        <button
          type="button"
          onClick={onOpenTerms}
          className="font-semibold text-moto-accent hover:underline"
        >
          Terms &amp; Conditions
        </button>
        .
      </p>
    </div>
  );
};

export default TermsCheckbox;
