/**
 * Рекомендуемые пути для сохранения файлов проекта.
 * Браузер не позволяет задать произвольный путь — используется id в showSaveFilePicker,
 * чтобы запомнить последнюю выбранную папку. При первом сохранении перейдите
 * в папку проекта и создайте/выберите Maps и Configurations.
 *
 * Рекомендуемая структура (пример для Windows):
 *   Industrial Door PLC/Maps          — карты маппинга
 *   Industrial Door PLC/Configurations — конфигурации
 */
export const RECOMMENDED_MAPS_PATH = 'Maps';
export const RECOMMENDED_CONFIGS_PATH = 'Configurations';

/** id для File System Access API: браузер запоминает последнюю папку для карт */
export const FILE_PICKER_ID_MAPS = 'industrial-door-maps';

/** id для File System Access API: браузер запоминает последнюю папку для конфигураций */
export const FILE_PICKER_ID_CONFIGS = 'industrial-door-configs';
