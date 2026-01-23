/**
 * Button компонент - кнопка с единым стилем
 */

const Button = ({ 
  children, 
  onClick, 
  disabled = false, 
  variant = 'primary',
  type = 'button',
  ...props 
}) => {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
