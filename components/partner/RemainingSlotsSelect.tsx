"use client";

const SLOT_VALUES = Array.from({ length: 999 }, (_, i) => i + 1);

type RemainingSlotsSelectProps = {
  id: string;
  name: string;
  /** Пустая строка — «Неограничено», иначе «1»…«999». */
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
};

export default function RemainingSlotsSelect({
  id,
  name,
  value,
  onChange,
  disabled,
}: RemainingSlotsSelectProps) {
  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Осталось мест
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 block w-full max-w-[12rem] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="">Неограничено</option>
        {SLOT_VALUES.map((n) => (
          <option key={n} value={String(n)}>
            {String(n).padStart(3, "0")}
          </option>
        ))}
      </select>
    </div>
  );
}
