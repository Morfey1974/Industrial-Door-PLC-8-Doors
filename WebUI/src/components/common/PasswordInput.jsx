/**
 * PasswordInput компонент - поле ввода пароля с иконкой показа/скрытия и кнопкой восстановления
 */

import { useState } from 'react';
import Button from './Button';
import './PasswordInput.css';

const PasswordInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  minLength,
  showForgotPassword = true,
  onForgotPassword,
  className = '',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleForgotPassword = () => {
    if (onForgotPassword) {
      onForgotPassword();
    } else {
      // По умолчанию показываем сообщение
      alert('Обратитесь к администратору для восстановления пароля');
    }
  };

  return (
    <div className={`password-input-group ${className}`}>
      {label && (
        <label htmlFor={id} className="password-input-label">
          {label}
          {required && <span style={{ color: '#d32f2f', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <div className="password-input-wrapper">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          className="form-control password-input-field"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          minLength={minLength}
          {...props}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={togglePasswordVisibility}
          disabled={disabled}
          title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
        >
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          )}
        </button>
      </div>
      {showForgotPassword && (
        <div className="password-forgot-wrapper">
          <button
            type="button"
            className="password-forgot-btn"
            onClick={handleForgotPassword}
            disabled={disabled}
          >
            Восстановить пароль
          </button>
        </div>
      )}
    </div>
  );
};

export default PasswordInput;
