/**
 * DCM Catalog - Navigation, product page from hash, request form
 */
(function () {
  var lang = typeof getLang === 'function' ? getLang() : 'en';
  var base = (lang === 'en') ? '' : '/' + lang;
  var labels = typeof getLabels === 'function' ? getLabels(lang) : {};

  function path(p) {
    if (p === 'index' || p === '') return base || '/';
    return (base + '/' + p).replace(/\/+/g, '/');
  }

  function renderProductPage() {
    if (typeof getProductById === 'undefined' || typeof getLabels === 'undefined') return;
    var hash = window.location.hash.slice(1);
    if (!hash) return;
    var product = getProductById(lang, hash);
    var container = document.getElementById('product-root');
    if (!container) return;
    if (!product) {
      container.innerHTML = '<p class="product-page-desc">' + (labels.noProduct || 'Product not found.') + '</p>' +
        '<a href="' + path('products.html') + '" class="btn-request">' + (labels.backToProducts || 'Back to products') + '</a>';
      return;
    }
    var specsHtml = product.specs && product.specs.length
      ? '<ul>' + product.specs.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>'
      : '';
    var docsHtml = product.docs && product.docs.length
      ? product.docs.map(function (d) {
          return '<a href="' + d.url + '" target="_blank" rel="noopener">' + d.label + '</a>';
        }).join(' ')
      : '';
    container.innerHTML =
      '<div class="breadcrumb">' +
        '<a href="' + path('') + '">' + (labels.breadcrumbHome || 'Home') + '</a> &rarr; ' +
        '<a href="' + path('products.html') + '">' + (labels.breadcrumbProducts || 'Products') + '</a> &rarr; ' +
        (labels.breadcrumbProduct || 'Product') +
      '</div>' +
      '<div class="product-layout">' +
        '<div class="product-page-img-wrap"><img class="product-page-img" src="' + (product.image || '../img/placeholder.jpg') + '" alt="" onerror="this.parentElement.style.background=\'linear-gradient(145deg,#cbd5e1,#94a3b8)\';this.style.display=\'none\'"></div>' +
        '<div>' +
          '<h1 class="product-page-title">' + product.name + '</h1>' +
          '<div class="product-page-price">' + product.price + '</div>' +
          '<p class="product-page-desc">' + (product.description || '').replace(/\n/g, '<br>') + '</p>' +
          (specsHtml ? '<div class="product-page-specs"><strong>Specs</strong>' + specsHtml + '</div>' : '') +
          (docsHtml ? '<div class="product-page-docs">' + docsHtml + '</div>' : '') +
          '<button type="button" class="btn-request" data-product-id="' + product.id + '" data-product-name="' + (product.name || '').replace(/"/g, '&quot;') + '">' + (labels.requestProduct || 'Request this product') + '</button>' +
        '</div>' +
      '</div>';
    bindRequestButtons();
  }

  function openRequestModal(productId, productName) {
    productName = (productName || '').replace(/&quot;/g, '"');
    var modal = document.getElementById('request-modal');
    var nameField = document.getElementById('request-product-name');
    var labelEl = document.getElementById('request-product-label');
    if (modal) {
      if (nameField) nameField.value = productName;
      if (labelEl) labelEl.textContent = (labels.formProduct || 'Product') + ': ' + productName;
      modal.classList.add('open');
      modal.setAttribute('data-product-id', productId || '');
    }
  }

  function closeRequestModal() {
    var modal = document.getElementById('request-modal');
    if (modal) modal.classList.remove('open');
  }

  function bindRequestButtons() {
    document.querySelectorAll('.btn-request[data-product-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openRequestModal(this.getAttribute('data-product-id'), this.getAttribute('data-product-name'));
      });
    });
    var submitBtn = document.getElementById('request-form-submit');
    var form = document.getElementById('request-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var productName = (document.getElementById('request-product-name') && document.getElementById('request-product-name').value) || '';
        var name = (document.getElementById('request-name') && document.getElementById('request-name').value) || '';
        var email = (document.getElementById('request-email') && document.getElementById('request-email').value) || '';
        var phone = (document.getElementById('request-phone') && document.getElementById('request-phone').value) || '';
        var message = (document.getElementById('request-message') && document.getElementById('request-message').value) || '';
        var body = 'Product: ' + productName + '\nName: ' + name + '\nEmail: ' + email + '\nPhone: ' + phone + '\n\nMessage: ' + message;
        var action = form.getAttribute('action');
        if (action && action.startsWith('mailto:')) {
          window.location.href = action + '?subject=' + encodeURIComponent('Catalog request: ' + productName) + '&body=' + encodeURIComponent(body);
        } else {
          form.submit();
        }
        closeRequestModal();
      });
    }
    if (submitBtn && !submitBtn.closest('form')) submitBtn.addEventListener('click', function () {
      var f = document.getElementById('request-form');
      if (f) f.requestSubmit();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderProductPage();
    document.getElementById('request-modal-cancel') && document.getElementById('request-modal-cancel').addEventListener('click', closeRequestModal);
    document.getElementById('request-modal') && document.getElementById('request-modal').addEventListener('click', function (e) {
      if (e.target === this) closeRequestModal();
    });
  });

  window.onhashchange = renderProductPage;
})();
