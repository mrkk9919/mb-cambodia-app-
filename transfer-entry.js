// 本地入口：把首页的"Chuyển tiền nội địa"（内部转账）磁贴接到 transfer.html
(function () {
  "use strict";

  var PATTERN = /n\u1ed9i \u0111\u1ecba|noi dia|internal transfer|内部转账/i;

  document.addEventListener("click", function (event) {
    if (event.__mbTransferHandled) return;
    var internationalButton = event.target.closest('[data-testid="button-feature-2"]');
    if (internationalButton) {
      event.__mbTransferHandled = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.href = "./international-transfer.html";
      return;
    }

    var savingsButton = event.target.closest('[data-testid="button-feature-3"]');
    if (savingsButton) {
      event.__mbTransferHandled = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.href = "./savings-investment.html";
      return;
    }

    var atmButton = event.target.closest('[data-testid="button-feature-6"]');
    if (atmButton) {
      event.__mbTransferHandled = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.href = "./cash-to-atm.html";
      return;
    }

    var node = event.target;
    for (var depth = 0; depth < 4 && node && node.nodeType === 1; depth++) {
      var text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length <= 40 && PATTERN.test(text)) {
        event.__mbTransferHandled = true;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.location.href = "./transfer.html";
        return;
      }
      node = node.parentElement;
    }
  }, true);
})();
