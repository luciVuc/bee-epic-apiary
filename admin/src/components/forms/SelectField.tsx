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
}

/** A controlled select element with accessible label and styling */
export function SelectField({
  label,
  value,
  onChange,
  options,
  name,
}: ISelectFieldProps) {
  const id = useId();
  const fieldId = name || `select-field-${id}`;

  return (
    <div data-testid="select-field">
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-dark-700 mb-2"
        data-testid="select-field_label"
      >
        {label}
      </label>
      <select
        id={fieldId}
        value={value}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        data-testid="select-field_select"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
