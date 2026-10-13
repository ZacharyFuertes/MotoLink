import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: "dark" | "light";
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = "",
  showLabel = false,
  variant = "dark",
}) => {
  const { isDark, toggleTheme } = useTheme();

  const variantClasses =
    variant === "light"
      ? "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"
      : "border-moto-gray bg-moto-darker/40 text-slate-300 backdrop-blur-md hover:border-moto-accent/60 hover:text-moto-accent";

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={!isDark}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 transition-colors ${variantClasses} ${className}`}
    >
      <motion.span
        key={isDark ? "sun" : "moon"}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex items-center"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </motion.span>
      {showLabel && (
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </motion.button>
  );
};

export default ThemeToggle;
