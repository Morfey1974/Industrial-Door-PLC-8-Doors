/**
 * Верхняя панель редактора карт
 */

import Button from '../common/Button';
import './MappingHeader.css';

const MappingHeader = ({
  projectName,
  mode,
  onModeChange,
  canEdit,
  onSave,
  onLoad,
  onClear,
  isDirty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFitToView,
}) => {
  return (
    <div className="mapping-header">
      <div className="mapping-header-left">
        <h2 className="mapping-title">Маппинг</h2>
        {projectName && <span className="mapping-project-name">{projectName}</span>}
      </div>
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
            <Button
              onClick={onSave}
              variant="primary"
              size="small"
              disabled={!isDirty}
            >
              Сохранить карту
            </Button>
            <Button onClick={onLoad} variant="secondary" size="small">
              Загрузить карту
            </Button>
            <Button onClick={onClear} variant="secondary" size="small">
              Очистить карту
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default MappingHeader;
