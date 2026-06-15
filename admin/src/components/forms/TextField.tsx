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
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type,
  name,
}: ITextFieldProps) {
  const id = useId();
  const fieldId = name || `text-field-${id}`;

  return (
    <div data-testid="text-field">
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-dark-700 mb-2"
        data-testid="text-field_label"
      >
        {label}
      </label>
      <input
        id={fieldId}
        type={type || "text"}
        value={value ?? ""}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid="text-field_input"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
      />
    </div>
  );
}
