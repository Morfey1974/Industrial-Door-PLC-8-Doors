/**
 * EventRow компонент - строка события в журнале
 */

const EventRow = ({ event }) => {
  return (
    <tr className="event-row">
      <td>{event.recSeq}</td>
      <td>{event.timestamp}</td>
      <td>{event.type}</td>
      <td>{event.source}</td>
      <td>{event.doorId || '—'}</td>
    </tr>
  );
};

export default EventRow;
