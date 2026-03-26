/**
 * Нормализация "сырых" текстов сетевых/API ошибок в локализованные сообщения UI.
 *
 * Зачем:
 * - на уровне API сейчас часть ошибок формируется фиксированным русским текстом;
 * - в английском UI это давало смешанные сообщения вида:
 *   "Error loading doors: Превышено время ожидания ...".
 *
 * Подход:
 * - определяем распространенные типы ошибок по подстрокам (ru/en);
 * - возвращаем перевод через i18n ключи;
 * - если ошибка неизвестна, возвращаем исходный текст как fallback.
 */
export function mapApiErrorToUiMessage(rawError, t) {
  const message = String(rawError || '');
  const lower = message.toLowerCase();

  // Таймаут ответа контроллера
  if (
    lower.includes('превышено время ожидания') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('econnaborted')
  ) {
    return t('pages.dashboard.errorTimeout');
  }

  // Разрыв/сброс соединения
  if (
    lower.includes('соединение с контроллером разорвано') ||
    lower.includes('connection reset') ||
    lower.includes('err_connection_reset')
  ) {
    return t('pages.dashboard.errorReset');
  }

  // Общая сетевая недоступность
  if (
    lower.includes('ошибка сети') ||
    lower.includes('network error') ||
    lower.includes('не удалось подключиться') ||
    lower.includes('failed to fetch')
  ) {
    return t('pages.dashboard.errorNetwork');
  }

  return message || t('pages.dashboard.errorUnknown');
}

