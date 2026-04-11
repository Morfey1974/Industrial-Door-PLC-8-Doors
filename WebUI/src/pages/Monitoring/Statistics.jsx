/**
 * Статистика — очереди FreeRTOS, RAM-журнал, стеки задач, буферы HTTP (GET /api/buffers).
 */

import { useCallback, useMemo } from 'react';
import useApi from '../../hooks/useApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useLanguage } from '../../context/LanguageContext';
import { getBufferStats } from '../../services/api';
import Table from '../../components/common/Table';
import Button from '../../components/common/Button';
import { mapApiErrorToUiMessage } from '../../utils/apiErrorI18n';
import './Monitoring.css';

function formatNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return String(n);
}

const Statistics = () => {
  const { t } = useLanguage();
  const fetchBuffers = useCallback((signal) => getBufferStats(signal), []);
  const { data, loading, error, refetch } = useApi(fetchBuffers, []);
  const errorText = mapApiErrorToUiMessage(error, t);

  useAutoRefresh(() => refetch(true), 5000);

  const queueColumns = useMemo(
    () => [
      { key: 'id', label: t('pages.statistics.buffersColQueue') },
      { key: 'waiting', label: t('pages.statistics.buffersColWaiting') },
      { key: 'capacity', label: t('pages.statistics.buffersColCapacity') },
      { key: 'peak', label: t('pages.statistics.buffersColPeak') },
      { key: 'extra', label: t('pages.statistics.buffersColNotes') },
    ],
    [t]
  );

  const taskColumns = useMemo(
    () => [
      { key: 'name', label: t('pages.statistics.buffersColTask') },
      { key: 'stackHighWaterWords', label: t('pages.statistics.buffersColStackHw') },
    ],
    [t]
  );

  const queueRows = useMemo(() => {
    if (!data?.queues?.length) return [];
    return data.queues.map((q) => ({
      id: q.id ?? '—',
      waiting: formatNum(q.waiting),
      capacity: formatNum(q.capacity),
      peak: formatNum(q.peak),
      extra:
        q.dropped !== undefined || q.ioErrors !== undefined
          ? [q.dropped ? `${t('pages.statistics.droppedQueue')}: ${q.dropped}` : '', q.ioErrors ? `${t('pages.statistics.ioErrors')}: ${q.ioErrors}` : '']
              .filter(Boolean)
              .join('; ')
          : '—',
    }));
  }, [data, t]);

  const taskRows = useMemo(() => {
    if (!data?.tasks?.length) return [];
    return data.tasks.map((task) => ({
      name: task.name ?? '—',
      stackHighWaterWords: formatNum(task.stackHighWaterWords),
    }));
  }, [data]);

  return (
    <div className="monitoring-statistics">
      <div className="page-header">
        <h1>{t('pages.statistics.title')}</h1>
        <p>{t('pages.statistics.subtitleBuffers')}</p>
      </div>

      <div className="stats-actions">
        <Button variant="secondary" size="small" onClick={() => refetch(false)} disabled={loading}>
          {t('common.refresh')}
        </Button>
      </div>

      {loading && !data && (
        <div className="loading-state">
          <p>{t('pages.statistics.loadingBuffers')}</p>
        </div>
      )}

      {error && !data && (
        <div className="error-state">
          <h3>{t('pages.statistics.errorLoad')}</h3>
          <p>{errorText}</p>
          <Button variant="primary" onClick={() => refetch(false)}>
            {t('common.retryAgain')}
          </Button>
        </div>
      )}

      {data?.ok === 1 && data.http && (
        <div className="stats-card stats-card-full" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          <h2>{t('pages.statistics.httpBuffers')}</h2>
          <ul className="stats-list">
            <li>
              {t('pages.statistics.httpRx')}: <strong>{formatNum(data.http.rxBufBytes)}</strong> {t('pages.statistics.bytes')}
            </li>
            <li>
              {t('pages.statistics.httpBodyMax')}: <strong>{formatNum(data.http.bodyMaxBytes)}</strong> {t('pages.statistics.bytes')}
            </li>
            <li>
              {t('pages.statistics.httpGetMax')}: <strong>{formatNum(data.http.getResponseMaxBytes)}</strong> {t('pages.statistics.bytes')}
            </li>
          </ul>
          <p className="stats-muted" style={{ marginTop: 'var(--spacing-md, 16px)' }}>
            {t('pages.statistics.buffersHint')}
          </p>
        </div>
      )}

      {data?.ok === 1 && queueRows.length > 0 && (
        <div className="stats-card stats-card-full" style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
          <h2>{t('pages.statistics.queuesTitle')}</h2>
          <Table columns={queueColumns} data={queueRows} />
        </div>
      )}

      {data?.ok === 1 && taskRows.length > 0 && (
        <div className="stats-card stats-card-full">
          <h2>{t('pages.statistics.tasksTitle')}</h2>
          <p className="stats-muted" style={{ marginBottom: 'var(--spacing-md, 16px)' }}>
            {t('pages.statistics.tasksHint')}
          </p>
          <Table columns={taskColumns} data={taskRows} />
        </div>
      )}
    </div>
  );
};

export default Statistics;
