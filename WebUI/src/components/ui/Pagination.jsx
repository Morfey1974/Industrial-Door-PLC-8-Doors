/**
 * Pagination компонент - пагинация для таблиц
 */

import Button from '../common/Button';
import { useLanguage } from '../../context/LanguageContext';

const Pagination = ({ offset, limit, count, total, onPrevious, onNext, onFirstPage, onPageClick, onPageSizeChange }) => {
  const { t } = useLanguage();
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  const hasPrevious = offset > 0;
  const hasNext = total > 0 && (offset + limit) < total;
  const showFirstPage = totalPages > 1 && currentPage > 2;

  /* Добавляем 100 записей на страницу для журнала событий.
   * API поддерживает limit до 100, что уменьшает количество переключений страниц. */
  const pageSizeOptions = [10, 20, 50, 100];

  // Генерируем номера страниц для отображения
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 7; // Максимум видимых номеров страниц
    
    if (totalPages <= maxVisiblePages) {
      // Если страниц немного, показываем все
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Если страниц много, показываем умную пагинацию
      if (currentPage <= 4) {
        // В начале: 1, 2, 3, 4, 5, ..., последняя
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        // В конце: 1, ..., предпоследние 5 страниц
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // В середине: 1, ..., текущая-1, текущая, текущая+1, ..., последняя
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="pagination">
      <div className="pagination-info">
        <span>
          {t('pagination.shown')
            .replace('{from}', String(count > 0 ? offset + 1 : 0))
            .replace('{to}', String(count > 0 ? offset + count : 0))
            .replace('{total}', String(total))}
        </span>
        {totalPages > 1 && (
          <span className="pagination-page-info">
            {t('pagination.page')
              .replace('{current}', String(currentPage))
              .replace('{total}', String(totalPages))}
          </span>
        )}
      </div>
      <div className="pagination-controls">
        <div className="pagination-buttons">
          {onFirstPage && showFirstPage && (
            <Button
              variant="secondary"
              onClick={onFirstPage}
            >
              {t('pagination.first')}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onPrevious}
            disabled={!hasPrevious}
          >
            {t('pagination.previous')}
          </Button>
          
          {/* Номера страниц */}
          {onPageClick && totalPages > 1 && (
            <div className="pagination-page-numbers">
              {pageNumbers.map((page, index) => {
                if (page === '...') {
                  return (
                    <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                      ...
                    </span>
                  );
                }
                const isActive = page === currentPage;
                return (
                  <button
                    key={page}
                    className={`pagination-page-number ${isActive ? 'active' : ''}`}
                    onClick={() => onPageClick(page)}
                    disabled={isActive}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
          )}
          
          <Button
            variant="secondary"
            onClick={onNext}
            disabled={!hasNext}
          >
            {t('pagination.next')}
          </Button>
        </div>
        {onPageSizeChange && (
          <div className="pagination-page-size">
            <label htmlFor="page-size">{t('pagination.pageSize')}</label>
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
