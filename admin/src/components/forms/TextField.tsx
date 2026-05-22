export interface ITextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
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
  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-medium text-dark-700 mb-2"
      >
        {label}
      </label>
      <input
        type={type || "text"}
        value={value ?? ""}
        name={name}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
      />
    </div>
  );
}
