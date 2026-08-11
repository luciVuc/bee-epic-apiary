import { useId } from "react";

/** A single option in a SelectField dropdown */
export interface ISelectFieldOption {
  value: string;
  label: string;
}

/** Props for the SelectField controlled component */
export interface ISelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ISelectFieldOption[];
  name?: string;
  /** Marks the field required (adds `aria-required`) */
  required?: boolean;
  /** Validation error message. When set, wires `aria-invalid` +
   *  `aria-describedby` to a rendered error node and shows the message. */
  error?: string;
}

/**
 * Controlled `<select>` with an associated label and the standard
 * required/error a11y wiring (`aria-required`, `aria-invalid`,
 * `aria-describedby`). The label is tied to the field via `name` when given,
 * else a `useId`-generated id, so multiple instances never collide.
 */
export function SelectField({
  label,
  value,
  onChange,
  options,
  name,
  required,
  error,
}: ISelectFieldProps) {
  const id = useId();
  const fieldId = name || `select-field-${id}`;
  const errorId = `${fieldId}-error`;

  return (
    <div data-testid="select-field">
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-dark-700 mb-2"
        data-testid="select-field_label"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        id={fieldId}
        value={value}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        data-testid="select-field_select"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p
          id={errorId}
          data-testid="select-field_error"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
