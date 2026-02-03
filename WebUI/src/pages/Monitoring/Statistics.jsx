/**
 * Statistics — сводная статистика по плану разработки:
 * журнал событий (GET /api/journal/stat), двери и аварии (GET /api/doors),
 * последние события (GET /api/journal/dump).
 */

import { useCallback } from 'react';
import useApi from '../../hooks/useApi';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import { useDoorsData } from '../../context/DoorsDataContext';
import { getJournalStat, getJournalDump } from '../../services/api';
import { formatTimestamp } from '../../utils/formatters';
import Button from '../../components/common/Button';
import './Monitoring.css';

const LAST_EVENTS_LIMIT = 10;

const Statistics = () => {
  const { data: doors, loading: doorsLoading, error: doorsError, refetch: refetchDoors } = useDoorsData();

  const fetchStat = useCallback((signal) => getJournalStat(signal), []);
  const { data: journalStat, loading: statLoading, error: statError, refetch: refetchStat } = useApi(fetchStat, []);

  const fetchLastEvents = useCallback((signal) => getJournalDump(0, LAST_EVENTS_LIMIT, signal), []);
  const { data: lastEvents, loading: eventsLoading, refetch: refetchEvents } = useApi(fetchLastEvents, []);

  const refetchAll = useCallback((silent = false) => {
    refetchDoors(silent);
    refetchStat(silent);
    refetchEvents(silent);
  }, [refetchDoors, refetchStat, refetchEvents]);

  useAutoRefresh(() => refetchAll(true), 10000);

  const totalDoors = doors?.doors?.length ?? 0;
  const alarmingCount = doors?.doors?.filter((d) => d.alarming)?.length ?? 0;
  const loading = statLoading && !journalStat;
  const error = statError || doorsError;

  return (
    <div className="monitoring-statistics">
      <div className="page-header">
        <h1>Статистика</h1>
        <p>Сводка по журналу событий, дверям и последним событиям. Данные обновляются каждые 10 с.</p>
      </div>

      {!loading && !error && (
        <div className="stats-actions">
          <Button variant="secondary" size="small" onClick={() => refetchAll(false)}>
            Обновить
          </Button>
        </div>
      )}

      {(loading || (statLoading && !journalStat)) && (
        <div className="loading-state">
          <p>Загрузка статистики…</p>
        </div>
      )}

      {error && !journalStat && !doors && (
        <div className="error-state">
          <h3>Ошибка загрузки данных</h3>
          <p>{error}</p>
          <Button variant="primary" onClick={() => refetchAll(false)}>
            Повторить попытку
          </Button>
        </div>
      )}

      {journalStat && (
        <div className="stats-grid">
          {/* Журнал событий */}
          <div className="stats-card">
            <h2>Журнал событий</h2>
            <p className="stats-value">{journalStat.recordsWritten ?? 0}</p>
            <p className="stats-label">записей записано</p>
            <ul className="stats-list">
              <li>Размер буфера: {(journalStat.size ?? 0).toLocaleString('ru-RU')} байт</li>
              <li>Сектор: {journalStat.currentSector ?? 0} из {journalStat.sectors ?? 0}</li>
              <li>Текущая последовательность: {journalStat.currentSeq ?? 0}</li>
              {journalStat.droppedQueue !== undefined && journalStat.droppedQueue > 0 && (
                <li className="stats-warning">Потеряно из очереди: {journalStat.droppedQueue}</li>
              )}
              {journalStat.ioErrors !== undefined && journalStat.ioErrors > 0 && (
                <li className="stats-warning">Ошибок ввода-вывода: {journalStat.ioErrors}</li>
              )}
            </ul>
          </div>

          {/* Двери и аварии */}
          <div className="stats-card">
            <h2>Двери</h2>
            {!doorsLoading && doors ? (
              <>
                <p className="stats-value">{totalDoors}</p>
                <p className="stats-label">всего дверей</p>
                <ul className="stats-list">
                  <li>С аварией: <strong>{alarmingCount}</strong></li>
                  <li>В норме: <strong>{totalDoors - alarmingCount}</strong></li>
                </ul>
              </>
            ) : (
              <p className="stats-muted">Загрузка…</p>
            )}
          </div>
        </div>
      )}

      {/* Последние события */}
      <div className="stats-card stats-card-full">
        <h2>Последние события</h2>
        {eventsLoading && !lastEvents?.records?.length && (
          <p className="stats-muted">Загрузка событий…</p>
        )}
        {lastEvents?.records?.length > 0 ? (
          <ul className="stats-events-list">
            {lastEvents.records.map((rec, idx) => (
              <li key={rec.recSeq ?? idx}>
                <span className="stats-event-time">{formatTimestamp(rec.timestamp)}</span>
                <span className="stats-event-type">{rec.type ?? '—'}</span>
                <span className="stats-event-door">Дверь {rec.doorId ?? '—'}</span>
                <span className="stats-event-source">{rec.source ?? '—'}</span>
              </li>
            ))}
          </ul>
        ) : lastEvents && !eventsLoading && (
          <p className="stats-muted">Нет записей в журнале</p>
        )}
      </div>
    </div>
  );
};

export default Statistics;
