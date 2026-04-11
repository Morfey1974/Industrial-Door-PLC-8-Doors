/**
 * Контент разделов помощи — тексты из локалей (pages.help.content.*).
 * Экспорт: HelpImagePlaceholder, getSectionContent(sectionId, t)
 */

import React from 'react';

/**
 * Плейсхолдер для будущего скриншота; подписи из локали.
 */
export function HelpImagePlaceholder({ caption, t }) {
  return (
    <figure className="help-figure">
      <div className="help-image-placeholder" aria-hidden="true">
        <span className="help-placeholder-icon">🖼</span>
        <span className="help-placeholder-text">{t('pages.help.placeholderLine1')}</span>
        <span className="help-placeholder-hint">{t('pages.help.placeholderLine2')}</span>
      </div>
      {caption && <figcaption className="help-figcaption">{caption}</figcaption>}
    </figure>
  );
}

/** Соответствие id раздела в URL → ключ строки заголовка в pages.help */
const SECTION_TITLE_KEY_BY_ID = {
  overview: 'sectionTitleOverview',
  'monitoring-doors': 'sectionTitleMonitoringDoors',
  'monitoring-events': 'sectionTitleMonitoringEvents',
  'monitoring-statistics': 'sectionTitleMonitoringStatistics',
  'config-doors': 'sectionTitleConfigDoors',
  'config-mapping': 'sectionTitleConfigMapping',
  'settings-system': 'sectionTitleSettingsSystem',
  'settings-profile': 'sectionTitleSettingsProfile',
  'settings-permissions': 'sectionTitleSettingsPermissions',
  'settings-users': 'sectionTitleSettingsUsers',
};

export function getHelpSectionTitle(sectionId, t) {
  const suffix = SECTION_TITLE_KEY_BY_ID[sectionId];
  return suffix ? t(`pages.help.${suffix}`) : sectionId;
}

/**
 * Тело раздела: многоабзацный текст из локали, абзацы разделены \n\n.
 */
export function getSectionContent(sectionId, t) {
  const contentKey = sectionId.replace(/-/g, '_');
  const i18nPath = `pages.help.content.${contentKey}`;
  const raw = t(i18nPath);
  if (!raw || raw === i18nPath) return null;
  const paragraphs = raw
    .split(/\n\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {paragraphs.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
    </>
  );
}
