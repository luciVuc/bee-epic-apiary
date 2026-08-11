/** Reusable text input with auto-generated label association */
import { useId } from "react";

export interface ITextFieldProps {
  /** Visible label text */
  label: string;
  /** Current input value */
  value: string;
  /** Change handler receiving the string value */
  onChange: (v: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Input type attribute (default "text") */
  type?: string;
  /** Optional name attribute, also used for label association */
  name?: string;
  /** Disable the input */
  disabled?: boolean;
  /** Marks the field required (adds `required` + `aria-required`) */
  required?: boolean;
  /** Validation error message. When set, wires `aria-invalid` +
   *  `aria-describedby` to a rendered error node and shows the message. */
  error?: string;
}

/**
 * Controlled single-line `<input>` with an associated label and the standard
 * required/error a11y wiring (`aria-required`, `aria-invalid`,
 * `aria-describedby`). The label id derives from `name` when given, else a
 * `useId`-generated id, so repeated instances stay unique.
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type,
  name,
  disabled,
  required,
  error,
}: ITextFieldProps) {
  const id = useId();
  const fieldId = name || `text-field-${id}`;
  const errorId = `${fieldId}-error`;

  return (
    <div data-testid="text-field">
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-dark-700 mb-2"
        data-testid="text-field_label"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <input
        id={fieldId}
        type={type || "text"}
        value={value ?? ""}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        data-testid="text-field_input"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
      />
      {error && (
        <p
          id={errorId}
          data-testid="text-field_error"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
