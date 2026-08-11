/** Reusable textarea with auto-generated label association */
import { useId } from "react";

export interface ITextAreaFieldProps {
  /** Visible label text */
  label: string;
  /** Current textarea value */
  value: string;
  /** Change handler receiving the string value */
  onChange: (v: string) => void;
  /** If true, the label element is visually hidden (still accessible) */
  hideLabel?: boolean;
  /** Optional name attribute, also used for label association */
  name?: string;
  /** Marks the field required (adds `required` + `aria-required`) */
  required?: boolean;
  /** Validation error message. When set, wires `aria-invalid` +
   *  `aria-describedby` to a rendered error node and shows the message. */
  error?: string;
}

/**
 * Controlled multi-line `<textarea>` with an associated label and the standard
 * required/error a11y wiring. When `hideLabel` is set the visible label is
 * dropped but the text is still exposed via `aria-label`, so the field remains
 * accessible in compact layouts.
 */
export function TextAreaField({
  label,
  value,
  onChange,
  hideLabel,
  name,
  required,
  error,
}: ITextAreaFieldProps) {
  const id = useId();
  const fieldId = name || `textarea-field-${id}`;
  const errorId = `${fieldId}-error`;

  return (
    <div className="w-full" data-testid="text-area-field">
      {!hideLabel && (
        <label
          htmlFor={fieldId}
          className="block text-sm font-medium text-dark-700 mb-2"
          data-testid="text-area-field_label"
        >
          {label}
          {required && (
            <span className="text-red-500 ml-1" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <textarea
        id={fieldId}
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-label={hideLabel ? label : undefined}
        data-testid="text-area-field_textarea"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
      />
      {error && (
        <p
          id={errorId}
          data-testid="text-area-field_error"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
