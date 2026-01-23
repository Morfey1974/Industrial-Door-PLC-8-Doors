/**
 * Input компонент - поле ввода с единым стилем
 */

const Input = ({ 
  type = 'text', 
  placeholder, 
  value, 
  onChange, 
  disabled = false,
  className = '',
  ...props 
}) => {
  return (
    <input
      type={type}
      className={`input ${className}`}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      {...props}
    />
  );
};

export default Input;
