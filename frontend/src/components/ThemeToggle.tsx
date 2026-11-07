import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === "dark");

  const toggleTheme = () => {
    const nextTheme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("sg_theme", nextTheme);
    setDark(!dark);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${dark ? "light" : "dark"} appearance`}
      title={`Switch to ${dark ? "light" : "dark"} appearance`}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-2)] transition-colors hover:bg-[var(--card-alt)] hover:text-[var(--text)]"
    >
      {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
