import { useState } from "react";
import type { IAuthPolicy } from "@bee-epic/shared";
import { evaluate } from "../../utils/authPolicy";

/**
 * Reusable controlled password input with a show/hide toggle and, when a
 * `policy` prop is provided, an inline hints list driven by the client-side
 * policy evaluator (Task 10.14).
 *
 * The value itself is always controlled by the caller — the only piece of
 * internal state is `revealed`, which flips the input's `type` between
 * "password" and "text". Distinguishing `policy: null` (fetch pending, still
 * render hints against defaults) from omitted `policy` (caller opted out of
 * hints entirely) is deliberate — the caller decides whether to display the
 * checklist at all.
 */
interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  policy?: IAuthPolicy | null;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  /**
   * When true, the underlying `<input>` gets React's `autoFocus` attribute so
   * the field receives focus on mount. Used by ChangePasswordModal to hand
   * keyboard focus to the current-password field when the modal opens (the
   * trigger in UserMenu unmounts, otherwise focus falls to `<body>`).
   */
  autoFocus?: boolean;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  policy,
  autoComplete,
  required,
  disabled,
  name,
  autoFocus,
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false);

  // `policy` is intentionally checked with hasOwnProperty-style semantics:
  // `undefined` (prop omitted) hides the list entirely, `null` (fetch pending)
  // still renders hints against server defaults so the user gets immediate
  // feedback even before the policy resolves.
  const hintsEnabled = policy !== undefined;
  const hints = hintsEnabled ? evaluate(value, policy ?? null) : [];

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-dark-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          className="w-full rounded-md border border-dark-300 px-3 py-2 pr-20 text-dark-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-dark-100 disabled:text-dark-500"
        />
        <button
          type="button"
          data-testid="password-field_toggle"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Hide password" : "Show password"}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-sm text-dark-500 hover:text-dark-700 focus:outline-none focus:text-dark-700 disabled:opacity-50"
        >
          <span aria-hidden="true">{revealed ? "Hide" : "Show"}</span>
        </button>
      </div>
      {hintsEnabled && (
        <ul
          data-testid="password-field_hints"
          className="mt-1 flex flex-col gap-0.5 text-xs text-dark-600"
        >
          {hints.map((hint, idx) => (
            <li key={idx} className="flex items-start gap-1">
              <span aria-hidden="true">{hint.ok ? "✔" : "✘"}</span>
              <span className="sr-only">
                {hint.ok ? "Passing:" : "Not yet:"}
              </span>
              <span>{hint.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
