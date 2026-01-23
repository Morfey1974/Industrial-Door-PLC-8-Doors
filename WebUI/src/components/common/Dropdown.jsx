/**
 * Dropdown компонент - выпадающий список с единым стилем
 */

const Dropdown = ({ 
  options, 
  value, 
  onChange, 
  placeholder = 'Выберите...',
  disabled = false,
  className = '',
  id,
  ...props
}) => {
  return (
    <select
      id={id}
      className={`dropdown ${className}`}
      value={value}
      onChange={onChange}
      disabled={disabled}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default Dropdown;
