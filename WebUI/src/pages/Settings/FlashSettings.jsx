/**
 * Настройки: только очистка рабочих областей QSPI на контроллере.
 * Логика модалки и таблицы сканирования — как раньше в SystemParams (раздел «Очистка флэш»).
 */

import { useState } from 'react';
import { scanFlashBoards, clearFlashSelected } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import './SystemParams.css';

const FlashSettings = () => {
  const { t } = useLanguage();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [flashClearing, setFlashClearing] = useState(false);
  const [flashModalOpen, setFlashModalOpen] = useState(false);
  const [flashBoards, setFlashBoards] = useState([]);
  const [flashSelected, setFlashSelected] = useState({});
  const [flashScanning, setFlashScanning] = useState(false);
  const [flashActionError, setFlashActionError] = useState(null);
  const [flashConfirmOpen, setFlashConfirmOpen] = useState(false);
  const [flashConfirmServiceClear, setFlashConfirmServiceClear] = useState(false);

  const openFlashModal = () => {
    setFlashModalOpen(true);
    setFlashActionError(null);
    setFlashBoards([]);
    setFlashSelected({});
    setFlashConfirmOpen(false);
    setFlashConfirmServiceClear(false);
  };

  const handleScanBoards = async () => {
    setFlashScanning(true);
    setFlashActionError(null);
    try {
      const resp = await scanFlashBoards();
      const boards = Array.isArray(resp?.boards) ? resp.boards : [];
      setFlashBoards(boards);
      setFlashSelected((prev) => {
        const next = {};
        boards.forEach((b) => {
          const key = String(b.nodeId);
          next[key] = prev[key] ?? false;
        });
        return next;
      });
    } catch (err) {
      setFlashActionError(err?.message || t('pages.flashSettings.flashScanFailed'));
    } finally {
      setFlashScanning(false);
    }
  };

  const selectedNodeIds = flashBoards
    .filter((b) => flashSelected[String(b.nodeId)])
    .map((b) => b.nodeId)
    .sort((a, b) => a - b);

  const selectedNodesMask = selectedNodeIds.reduce((mask, nodeId) => (
    mask | (1 << (nodeId - 1))
  ), 0);

  const handleConfirmSelectedClear = async () => {
    setFlashConfirmOpen(false);
    if (selectedNodeIds.length === 0) return;
    const clearService = flashConfirmServiceClear;
    setFlashClearing(true);
    setFlashActionError(null);
    setError(null);
    setSuccess(null);
    try {
      await clearFlashSelected(selectedNodesMask, clearService);
      setSuccess(t('pages.flashSettings.flashClearSuccessList', { nodes: selectedNodeIds.join(', ') }));
      setFlashModalOpen(false);
    } catch (err) {
      const msg = err?.message || t('pages.flashSettings.flashClearFailed');
      setFlashActionError(msg);
      setError(msg);
    } finally {
      setFlashClearing(false);
    }
  };

  return (
    <div className="settings-system-params">
      <h1>{t('pages.flashSettings.title')}</h1>
      <p className="system-params-page-intro">
        {t('pages.flashSettings.intro')}
      </p>

      {typeof window !== 'undefined' && window.location?.protocol === 'http:' && (
        <div className="system-params-message" style={{ backgroundColor: '#fff8e1', border: '1px solid #ffa000', color: '#e65100' }} role="status">
          {t('pages.flashSettings.httpWarning')}
        </div>
      )}

      {error && (
        <div className="system-params-message system-params-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="system-params-message system-params-success" role="status">
          {success}
        </div>
      )}

      <section className="system-params-section system-params-section-flash-clear">
        <h2>{t('pages.flashSettings.sectionFlash')}</h2>
        <p className="system-params-intro">
          {t('pages.flashSettings.flashIntro')}
        </p>
        <p className="system-params-note">
          {t('pages.flashSettings.flashHint')}
        </p>
        <div className="system-params-actions">
          <Button
            type="button"
            variant="primary"
            onClick={openFlashModal}
            disabled={flashClearing}
          >
            {flashClearing ? t('pages.flashSettings.flashClearing') : t('pages.flashSettings.flashClearButton')}
          </Button>
        </div>
      </section>

      <Modal
        isOpen={flashModalOpen}
        onClose={() => setFlashModalOpen(false)}
        title={t('pages.flashSettings.flashModalTitle')}
        contentClassName="modal-content-wide-flash"
      >
        <div className="flash-clear-modal">
          <p className="system-params-intro">{t('pages.flashSettings.flashModalIntro')}</p>
          <p className="system-params-note">{t('pages.flashSettings.flashUsersPreservedNote')}</p>
          <div className="flash-clear-actions-row">
            <Button
              type="button"
              variant="secondary"
              onClick={handleScanBoards}
              disabled={flashScanning || flashClearing}
            >
              {flashScanning ? t('pages.flashSettings.flashScanning') : t('pages.flashSettings.flashScanButton')}
            </Button>
          </div>

          {flashActionError && (
            <div className="system-params-message system-params-error" role="alert">
              {flashActionError}
            </div>
          )}

          <div className="flash-clear-table-wrap">
            <table className="flash-clear-table">
              <thead>
                <tr>
                  <th>{t('pages.flashSettings.flashColSelect')}</th>
                  <th>{t('pages.flashSettings.flashColNode')}</th>
                  <th>{t('pages.flashSettings.flashColOnline')}</th>
                  <th>{t('pages.flashSettings.flashColHasData')}</th>
                  <th>{t('pages.flashSettings.flashColConfig')}</th>
                  <th>{t('pages.flashSettings.flashColMapping')}</th>
                  <th>{t('pages.flashSettings.flashColUsers')}</th>
                </tr>
              </thead>
              <tbody>
                {flashBoards.length === 0 ? (
                  <tr>
                    <td colSpan={7}>{t('pages.flashSettings.flashNoScanData')}</td>
                  </tr>
                ) : flashBoards.map((board) => (
                  <tr key={board.nodeId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!flashSelected[String(board.nodeId)]}
                        onChange={(e) => setFlashSelected((prev) => ({ ...prev, [String(board.nodeId)]: e.target.checked }))}
                        disabled={flashClearing}
                      />
                    </td>
                    <td>{t('pages.flashSettings.flashBoardNode', { n: board.nodeId })}</td>
                    <td>{board.online ? t('pages.flashSettings.flashYes') : t('pages.flashSettings.flashNo')}</td>
                    <td>{board.hasData ? t('pages.flashSettings.flashHasData') : t('pages.flashSettings.flashEmpty')}</td>
                    <td>{board.config ? t('pages.flashSettings.flashYes') : t('pages.flashSettings.flashNo')}</td>
                    <td>{board.mapping ? t('pages.flashSettings.flashYes') : t('pages.flashSettings.flashNo')}</td>
                    <td>{board.users ? t('pages.flashSettings.flashYes') : t('pages.flashSettings.flashNo')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flash-clear-actions-row">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setFlashConfirmServiceClear(false);
                setFlashConfirmOpen(true);
              }}
              disabled={flashClearing || selectedNodeIds.length === 0}
            >
              {flashClearing ? t('pages.flashSettings.flashClearing') : t('pages.flashSettings.flashClearSelectedButton')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setFlashConfirmServiceClear(true);
                setFlashConfirmOpen(true);
              }}
              disabled={flashClearing || selectedNodeIds.length === 0}
            >
              {flashClearing ? t('pages.flashSettings.flashClearing') : t('pages.flashSettings.flashClearServiceButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFlashModalOpen(false)}
              disabled={flashClearing}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={flashConfirmOpen}
        type="confirm"
        title={t('pages.flashSettings.flashConfirmTitle')}
        message={
          flashConfirmServiceClear
            ? `${t('pages.flashSettings.flashConfirmServiceSelectedText', { nodes: selectedNodeIds.join(', ') })}\n${t('pages.flashSettings.flashServiceDangerNote')}`
            : `${t('pages.flashSettings.flashConfirmSelectedText', { nodes: selectedNodeIds.join(', ') })}\n${t('pages.flashSettings.flashUsersPreservedNote')}`
        }
        confirmText={t('pages.flashSettings.flashConfirmProceed')}
        cancelText={t('common.cancel')}
        onConfirm={handleConfirmSelectedClear}
        onCancel={() => {
          setFlashConfirmOpen(false);
          setFlashConfirmServiceClear(false);
        }}
      />
    </div>
  );
};

export default FlashSettings;
