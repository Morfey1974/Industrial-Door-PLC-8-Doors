/**
 * Button компонент - кнопка с единым стилем
 */

const Button = ({ 
  children, 
  onClick, 
  disabled = false, 
  variant = 'primary',
  type = 'button',
  size = 'normal', // 'small', 'normal', 'large'
  ...props 
}) => {
  const sizeClass = size !== 'normal' ? `btn-${size}` : '';
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${sizeClass}`.trim()}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
