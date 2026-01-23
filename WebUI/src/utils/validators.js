/**
 * Утилиты для валидации форм
 */

/**
 * Валидация email
 */
export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

/**
 * Валидация обязательного поля
 */
export const validateRequired = (value) => {
  return value !== null && value !== undefined && value.toString().trim() !== '';
};

/**
 * Валидация числового значения в диапазоне
 */
export const validateNumberRange = (value, min, max) => {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Валидация порта (1-65535)
 */
export const validatePort = (port) => {
  return validateNumberRange(port, 1, 65535);
};

/**
 * Валидация таймаута (минимальное значение)
 */
export const validateTimeout = (timeout, min = 1000) => {
  return validateNumberRange(timeout, min, Infinity);
};
