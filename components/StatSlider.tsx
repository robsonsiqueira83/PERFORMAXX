import React from 'react';

interface StatSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}

const StatSlider: React.FC<StatSliderProps> = ({ label, value, onChange, disabled }) => {
  // Logic: <4 Red, 4-7 Gray, 8-10 Green
  const getColor = (v: number) => {
    if (v < 4) return 'bg-red-500';
    if (v < 8) return 'bg-gray-500'; // 4 to 7.9
    return 'bg-[#4ade80]'; // Green
  };

  const getTextColor = (v: number) => {
    if (v < 4) return 'text-red-600';
    if (v < 8) return 'text-gray-600';
    return 'text-green-600';
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium text-gray-900">{label}</label>
        <span className={`text-sm font-bold ${getTextColor(value)}`}>{value}</span>
      </div>
      <div className="flex items-center gap-2">
         <span className="text-xs text-gray-400">0</span>
         <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            disabled={disabled}
            className={`w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-600`}
        />
         <span className="text-xs text-gray-400">10</span>
      </div>
      <div className={`h-1 w-full mt-1 rounded ${getColor(value)} opacity-50`}></div>
    </div>
  );
};

export default StatSlider;