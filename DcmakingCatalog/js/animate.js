/**
 * Scroll-triggered animations: add .animate-in when element enters viewport
 */
(function () {
  function run() {
    var els = document.querySelectorAll('[data-animate]');
    var observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 }) : null;

    if (observer) {
      els.forEach(function (el) { observer.observe(el); });
    } else {
      els.forEach(function (el) { el.classList.add('animate-in'); });
    }

    var cards = document.querySelectorAll('.product-card');
    if (cards.length && !document.querySelector('.product-card.animate-in')) {
      var cardObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
          }
        });
      }, { rootMargin: '0px 0px -20px 0px', threshold: 0.05 }) : null;
      if (cardObserver) {
        cards.forEach(function (el) { cardObserver.observe(el); });
      } else {
        cards.forEach(function (el, i) {
          el.style.animationDelay = (i * 0.06) + 's';
          el.classList.add('animate-in');
        });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
