import React from 'react';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (val: number) => void;
  className?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({ 
  value, 
  onChange, 
  className = "", 
  ...props 
}) => {
  const displayValue = value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onChange(isNaN(val) ? 0 : val);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <input
      {...props}
      type="number"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      className={className}
    />
  );
};
