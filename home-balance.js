(function () {
  "use strict";

  var balanceEl = null;
  var balanceObserver = null;
  var rootObserver = null;
  var initialized = false;
  var usdTotal = 0;

  function sumUsd(accounts) {
    return Math.round(accounts.filter(function (account) {
      return String(account.currency || "").toUpperCase() === "USD";
    }).reduce(function (sum, account) {
      return sum + Math.round((Number(account.balance) || 0) * 100);
    }, 0)) / 100;
  }

  function applyBalance() {
    if (!balanceEl) return;
    var toggle = document.querySelector('[data-testid="button-toggle-balance"]');
    var visible = toggle && toggle.getAttribute("aria-pressed") === "true";
    var text = visible
      ? usdTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "******";
    var textNode = Array.prototype.find.call(balanceEl.childNodes, function (node) {
      return node.nodeType === Node.TEXT_NODE;
    });

    if (!textNode) {
      balanceEl.insertBefore(document.createTextNode(text + " "), balanceEl.firstChild);
    } else if (textNode.textContent.trim() !== text) {
      textNode.textContent = text + " ";
    }
  }

  function useAccounts(accounts) {
    if (!Array.isArray(accounts)) return;
    usdTotal = sumUsd(accounts);
    applyBalance();
  }

  function loadAccounts() {
    fetch("/api/internal/accounts", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Account list unavailable");
        return response.json();
      })
      .then(function (data) {
        if (data && Array.isArray(data.accounts) && data.accounts.length) {
          useAccounts(data.accounts);
        }
      })
      .catch(function () {});
  }

  useAccounts(window.mbDemoAccounts || []);
  window.addEventListener("mb:accounts-updated", function (event) {
    useAccounts(event.detail);
  });
  document.addEventListener("mb:payment-recorded", loadAccounts);

  function initialize() {
    if (initialized) return true;
    balanceEl = document.querySelector('[data-testid="text-account-balance"]');
    if (!balanceEl) return false;
    initialized = true;
    if (rootObserver) rootObserver.disconnect();
    applyBalance();
    balanceObserver = new MutationObserver(applyBalance);
    balanceObserver.observe(balanceEl, { childList: true, characterData: true, subtree: true });
    loadAccounts();
    return true;
  }

  if (!initialize()) {
    var root = document.getElementById("root");
    if (root) {
      rootObserver = new MutationObserver(initialize);
      rootObserver.observe(root, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", initialize, { once: true });
    }
  }
})();
