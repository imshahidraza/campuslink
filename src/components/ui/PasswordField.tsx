"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  className: string; // same base input styling the caller uses elsewhere
}

/**
 * Password input with a show/hide toggle — a crossfading, slightly-bouncy
 * eye icon rather than a static one, so the interaction feels a bit more
 * alive without being distracting.
 */
export function PasswordField({ value, onChange, placeholder, required, minLength, className }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        required={required}
        type={visible ? "text" : "password"}
        minLength={minLength}
        className={`${className} pr-11`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="current-password"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-90 transition-all duration-150"
      >
        <span className="relative block h-4 w-4">
          <Eye
            className={`absolute inset-0 h-4 w-4 transition-all duration-300 ease-out ${
              visible ? "opacity-0 scale-50 -rotate-45" : "opacity-100 scale-100 rotate-0"
            }`}
          />
          <EyeOff
            className={`absolute inset-0 h-4 w-4 transition-all duration-300 ease-out ${
              visible ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 rotate-45"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
