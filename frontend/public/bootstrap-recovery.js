(function () {
  'use strict';

  function showRecovery() {
    var status = document.getElementById('enziu-startup-status');
    var button = document.getElementById('enziu-startup-reload');
    if (status) status.textContent = 'Chưa tải được giao diện. Bạn vui lòng tải lại trang.';
    if (button) {
      button.hidden = false;
      button.onclick = function () { window.location.reload(); };
    }
  }

  function recover() {
    // A broken release or blocked network must never cause a reload loop.
    var entry = document.querySelector('script[type="module"][src]');
    var key = 'enziu:bootstrap-recovery:' + (entry ? entry.src : window.location.pathname);
    try {
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
    } catch (_) {
      // With storage disabled, show a manual retry instead of repeatedly reloading.
    }
    showRecovery();
  }

  window.addEventListener('vite:preloadError', function (event) {
    event.preventDefault();
    recover();
  });
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target.tagName === 'SCRIPT' && target.type === 'module') recover();
  }, true);
  window.addEventListener('DOMContentLoaded', function () {
    window.setTimeout(showRecovery, 20000);
  });
}());
