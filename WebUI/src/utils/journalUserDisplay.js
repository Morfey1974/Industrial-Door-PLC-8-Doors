/**
 * Колонка «Пользователь» в журнале: имя из записи EVT1 (username в JSON);
 * для событий шины (EVT0) имя в Flash нет — показываем подпись по source.
 */
export function formatJournalUserColumn(event, t) {
  if (!event) return '—';
  const trimmed = event.username != null && String(event.username).trim()
    ? String(event.username).trim()
    : '';
  if (trimmed) {
    const k = trimmed.toLowerCase();
    if (k === 'system') return t('pages.events.userDisplaySystem');
    if (k === 'can') return t('pages.events.userDisplayCan');
    if (k === 'rs485') return t('pages.events.userDisplayRs485');
    if (k === 'watchdog') return t('pages.events.userDisplayWatchdog');
    if (k === 'network') return t('pages.events.userDisplayNetwork');
    return trimmed;
  }
  const src = String(event.source || '').toUpperCase();
  switch (src) {
    case 'DOOR_LOCAL':
    case 'NONE':
      return t('pages.events.userDisplaySystem');
    case 'CAN':
      return t('pages.events.userDisplayCan');
    case 'RS485':
      return t('pages.events.userDisplayRs485');
    case 'WATCHDOG':
      return t('pages.events.userDisplayWatchdog');
    case 'SUPERVISOR':
      return t('pages.events.userDisplayNetwork');
    case 'HTTP':
      return t('pages.events.userDisplayWeb');
    default:
      return src || t('pages.events.userDisplaySystem');
  }
}
