/**
 * Помощь — главная страница (список разделов) и отдельная страница для каждого раздела
 * Каждый пункт открывается по своему URL: /settings/help, /settings/help/overview, /settings/help/monitoring-doors и т.д.
 */

import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSectionContent } from './HelpContent';
import './Help.css';

export const HELP_SECTIONS = [
  { id: 'overview', title: 'Обзор интерфейса', keywords: 'главная шапка меню вкладки сайдбар' },
  { id: 'monitoring-doors', title: 'Мониторинг → Двери', keywords: 'двери состояние открыто закрыто карта' },
  { id: 'monitoring-events', title: 'Мониторинг → События', keywords: 'события журнал лог' },
  { id: 'monitoring-alarms', title: 'Мониторинг → Алармы', keywords: 'алармы тревоги предупреждения' },
  { id: 'monitoring-statistics', title: 'Мониторинг → Статистика', keywords: 'статистика счётчики' },
  { id: 'config-doors', title: 'Конфигурация → Настройка дверей', keywords: 'конфигурация двери настройка маппинг' },
  { id: 'config-mapping', title: 'Конфигурация → Маппинг', keywords: 'маппинг карта дверей редактор' },
  { id: 'settings-system', title: 'Настройки → Параметры системы', keywords: 'система сеть параметры IP адрес' },
  { id: 'settings-profile', title: 'Настройки → Профиль', keywords: 'профиль пароль смена' },
  { id: 'settings-permissions', title: 'Настройки → Права доступа', keywords: 'права роли доступ' },
  { id: 'settings-users', title: 'Настройки → Пользователи', keywords: 'пользователи учётные записи' },
];

/**
 * Главная страница помощи — список разделов (каждый открывается отдельной страницей)
 */
function HelpIndex() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return HELP_SECTIONS;
    const q = searchQuery.trim().toLowerCase();
    return HELP_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div className="help-page">
      <header className="help-header">
        <h1 className="help-title">Помощь по системе</h1>
        <p className="help-intro">
          Выберите раздел — откроется отдельная страница. В будущем здесь будет полноценная справка по приложению.
        </p>
        <div className="help-search-wrap">
          <label htmlFor="help-search" className="help-search-label">
            Быстрый поиск по разделам
          </label>
          <input
            id="help-search"
            type="search"
            className="help-search-input"
            placeholder="Введите слово или фразу (например: двери, пароль, права)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className="help-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить поиск"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <main className="help-index-content">
        <h2 className="help-index-title">Содержание</h2>
        {filteredSections.length === 0 ? (
          <p className="help-index-empty">Ничего не найдено</p>
        ) : (
          <ul className="help-index-list">
            {filteredSections.map((s) => (
              <li key={s.id} className="help-index-item">
                <Link to={`/settings/help/${s.id}`} className="help-index-link">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

/**
 * Страница одного раздела помощи
 */
export function HelpSectionPage() {
  const { sectionId } = useParams();
  const section = HELP_SECTIONS.find((s) => s.id === sectionId);
  const content = sectionId ? getSectionContent(sectionId) : null;

  if (!section || !content) {
    return (
      <div className="help-page help-section-page">
        <p className="help-not-found">Раздел не найден.</p>
        <Link to="/settings/help" className="help-back-link">
          ← К содержанию
        </Link>
      </div>
    );
  }

  return (
    <div className="help-page help-section-page">
      <div className="help-section-back">
        <Link to="/settings/help" className="help-back-link">
          ← К содержанию
        </Link>
      </div>
      <main className="help-content help-section-only">
        <h1 className="help-section-title">{section.title}</h1>
        <div className="help-section-body">
          {content}
        </div>
      </main>
    </div>
  );
}

export default HelpIndex;
