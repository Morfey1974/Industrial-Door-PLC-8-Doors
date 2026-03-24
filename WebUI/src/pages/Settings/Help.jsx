/**
 * Помощь — главная страница (список разделов) и отдельная страница для каждого раздела
 * Каждый пункт открывается по своему URL: /settings/help, /settings/help/overview, /settings/help/monitoring-doors и т.д.
 */

import { useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { getSectionContent, getHelpSectionTitle } from './HelpContent';
import './Help.css';

/** Порядок разделов в содержании; заголовки и ключевые слова — из локалей */
export const HELP_SECTION_IDS = [
  'overview',
  'monitoring-doors',
  'monitoring-events',
  'monitoring-alarms',
  'monitoring-statistics',
  'config-doors',
  'config-mapping',
  'settings-system',
  'settings-profile',
  'settings-permissions',
  'settings-users',
];

/**
 * Главная страница помощи — список разделов (каждый открывается отдельной страницей)
 */
function HelpIndex() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = useMemo(() => {
    const sections = HELP_SECTION_IDS.map((id) => ({
      id,
      title: getHelpSectionTitle(id, t),
      keywords: t(`pages.help.keywords.${id}`),
    }));
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.trim().toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.toLowerCase().includes(q)
    );
  }, [searchQuery, t]);

  return (
    <div className="help-page">
      <header className="help-header">
        <h1 className="help-title">{t('pages.help.title')}</h1>
        <p className="help-intro">{t('pages.help.indexIntro')}</p>
        <div className="help-search-wrap">
          <label htmlFor="help-search" className="help-search-label">
            {t('pages.help.searchLabel')}
          </label>
          <input
            id="help-search"
            type="search"
            className="help-search-input"
            placeholder={t('pages.help.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className="help-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label={t('pages.help.clearSearchAria')}
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <main className="help-index-content">
        <h2 className="help-index-title">{t('pages.help.contents')}</h2>
        {filteredSections.length === 0 ? (
          <p className="help-index-empty">{t('pages.help.nothingFound')}</p>
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
  const { t } = useLanguage();
  const title = sectionId ? getHelpSectionTitle(sectionId, t) : '';
  const content = sectionId ? getSectionContent(sectionId, t) : null;

  if (!sectionId || !HELP_SECTION_IDS.includes(sectionId) || !content) {
    return (
      <div className="help-page help-section-page">
        <p className="help-not-found">{t('pages.help.notFound')}</p>
        <Link to="/settings/help" className="help-back-link">
          {t('pages.help.backToContents')}
        </Link>
      </div>
    );
  }

  return (
    <div className="help-page help-section-page">
      <div className="help-section-back">
        <Link to="/settings/help" className="help-back-link">
          {t('pages.help.backToContents')}
        </Link>
      </div>
      <main className="help-content help-section-only">
        <h1 className="help-section-title">{title}</h1>
        <div className="help-section-body">
          {content}
        </div>
      </main>
    </div>
  );
}

export default HelpIndex;
