import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  segmented?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = "",
  showLabel = false,
  size = "sm",
  segmented = false,
}) => {
  const { theme, resolvedTheme, isDark, toggleTheme, setTheme } = useTheme();

  if (segmented) {
    const options = [
      { value: "system" as const, label: "Auto" },
      { value: "light" as const, label: "Light" },
      { value: "dark" as const, label: "Dark" },
    ];
    return (
      <div role="group" aria-label="Color theme" className={`grid grid-cols-3 gap-1 rounded-lg border border-border-default bg-raised p-1 ${className}`}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={theme === option.value}
            onClick={() => setTheme(option.value)}
            className={`rounded-md px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${theme === option.value ? "dashboard-theme-selected border border-border-strong bg-surface font-semibold text-text-primary" : "dashboard-theme-unselected border border-transparent font-medium text-text-muted hover:bg-hover hover:text-text-primary"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  const icon = resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : (
    resolvedTheme === "light" ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />
  );

  const labelText =
    theme === "system"
      ? "System"
      : theme === "light"
        ? "Light"
        : "Dark";

  const tooltip =
    theme === "system"
      ? `System theme (currently ${resolvedTheme})`
      : `Switch to ${theme === "dark" ? "light" : theme === "light" ? "system" : "dark"} mode`;

  const sizeClasses =
    size === "sm"
      ? "rounded-lg border px-2.5 py-2"
      : "rounded-xl border px-4 py-2.5";

  const variantClasses =
    resolvedTheme === "dark"
      ? "border-moto-gray bg-moto-darker/40 text-slate-300 backdrop-blur-md hover:border-moto-accent/60 hover:text-moto-accent"
      : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900";

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={isDark}
      className={`inline-flex items-center justify-center gap-1.5 transition-colors duration-200 ${sizeClasses} ${variantClasses} ${className}`}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex items-center"
      >
        {icon}
      </motion.span>
      {showLabel && (
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {labelText}
        </span>
      )}
    </motion.button>
  );
};

export default ThemeToggle;
