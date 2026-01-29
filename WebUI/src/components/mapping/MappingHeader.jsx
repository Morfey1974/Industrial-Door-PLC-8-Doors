/**
 * Верхняя панель редактора карт
 */

import Button from '../common/Button';
import './MappingHeader.css';

const MappingHeader = ({
  mapDisplayName,
  onSaveAndExit,
  mode,
  onModeChange,
  canEdit,
  onSaveToFile,
  onLoadFromFile,
  onUploadToController,
  onLoadFromController,
  onClear,
  canUploadToController = true,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitToView,
}) => {
  return (
    <div className="mapping-header">
      <div className="mapping-header-name-row">
        <span className="mapping-header-title">Маппинг:</span>
        <span className="mapping-header-map-name" title="Название карты (привязана к конфигурации с тем же именем)">
          {mapDisplayName}
        </span>
      </div>
      <div className="mapping-header-buttons-row">
      <div className="mapping-header-center">
        {canEdit && (
          <div className="mapping-header-center-row">
            <div className="mapping-mode-switcher">
              <button
                className={`mode-button ${mode === 'edit' ? 'active' : ''}`}
                onClick={() => onModeChange('edit')}
              >
                Редактирование
              </button>
              <button
                className={`mode-button ${mode === 'view' ? 'active' : ''}`}
                onClick={() => onModeChange('view')}
              >
                Просмотр
              </button>
            </div>
            {mode === 'edit' && (
              <div className="mapping-history-buttons">
                <button
                  type="button"
                  className="header-history-btn"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Отменить (Ctrl+Z)"
                >
                  ↶ Отменить
                </button>
                <button
                  type="button"
                  className="header-history-btn"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Повторить (Ctrl+Shift+Z)"
                >
                  ↷ Повторить
                </button>
                {onFitToView && (
                  <button
                    type="button"
                    className="header-history-btn"
                    onClick={onFitToView}
                    title="Показать карту полностью в окне"
                  >
                    ⊞ Показать карту
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mapping-header-right">
        {canEdit && mode === 'edit' && (
          <>
            <Button onClick={onSaveToFile} variant="primary" size="small" title="Сохранить карту в файл на компьютере">
              Сохранить карту
            </Button>
            <Button onClick={onLoadFromFile} variant="secondary" size="small" title="Загрузить карту из файла с компьютера">
              Загрузить карту
            </Button>
            <Button
              onClick={onUploadToController}
              variant="secondary"
              size="small"
              disabled={!canUploadToController}
              title={canUploadToController ? 'Выгрузить текущую карту в QSPI контроллера' : 'Сначала сохраните карту в файл (Сохранить карту)'}
            >
              Выгрузить карту в контроллер
            </Button>
            <Button onClick={onLoadFromController} variant="secondary" size="small" title="Загрузить карту из QSPI контроллера">
              Загрузить карту из контроллера
            </Button>
            <Button onClick={onClear} variant="secondary" size="small">
              Очистить карту
            </Button>
            {onSaveAndExit && (
              <Button onClick={onSaveAndExit} variant="primary" size="small" title="Сохранить карту в файл и вернуться в редактор конфигурации">
                Сохранить и выйти в конфигуратор
              </Button>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
};

export default MappingHeader;
