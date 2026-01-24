/**
 * Pagination компонент - пагинация для таблиц
 */

import Button from '../common/Button';

const Pagination = ({ offset, limit, count, total, onPrevious, onNext, onPageSizeChange }) => {
  const currentPage = Math.floor(offset / limit) + 1;
  // Если total приблизительное (больше чем offset + count), показываем "~"
  const totalPages = total > offset + count ? null : (total > 0 ? Math.ceil(total / limit) : 1);
  const hasPrevious = offset > 0;
  const hasNext = count === limit; // Если получили полную страницу, значит есть еще данные

  const pageSizeOptions = [10, 20, 50, 100];

  return (
    <div className="pagination">
      <div className="pagination-info">
        <span>
          Показано {offset + 1}—{offset + count} {total > offset + count ? `из ~${total}` : `из ${total}`} записей
        </span>
        {totalPages && totalPages > 1 && (
          <span className="pagination-page-info">
            Страница {currentPage} из {totalPages}
          </span>
        )}
        {!totalPages && (
          <span className="pagination-page-info">
            Страница {currentPage}
          </span>
        )}
      </div>
      <div className="pagination-controls">
        <div className="pagination-buttons">
          <Button
            variant="secondary"
            onClick={onPrevious}
            disabled={!hasPrevious}
          >
            ← Предыдущая
          </Button>
          <Button
            variant="secondary"
            onClick={onNext}
            disabled={!hasNext}
          >
            Следующая →
          </Button>
        </div>
        {onPageSizeChange && (
          <div className="pagination-page-size">
            <label htmlFor="page-size">Записей на странице:</label>
            <select
              id="page-size"
              className="dropdown"
              value={limit}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pagination;
