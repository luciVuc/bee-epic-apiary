import { useId } from "react";

export interface ITextAreaFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hideLabel?: boolean;
  name?: string;
}

export function TextAreaField({
  label,
  value,
  onChange,
  hideLabel,
  name,
}: ITextAreaFieldProps) {
  const id = useId();
  const fieldId = name || `textarea-field-${id}`;

  return (
    <div className="w-full" data-testid="text-area-field">
      {!hideLabel && (
        <label
          htmlFor={fieldId}
          className="block text-sm font-medium text-dark-700 mb-2"
          data-testid="text-area-field_label"
        >
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        data-testid="text-area-field_textarea"
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
      />
    </div>
  );
}
