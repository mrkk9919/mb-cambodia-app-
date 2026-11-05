(function () {
  "use strict";

  var page = document.getElementById("account-page");
  if (!page) return;

  var listEl = document.getElementById("acct-list");
  var titleEl = document.getElementById("acct-list-title");
  var balEl = document.getElementById("acct-balance-amount");
  var exEl = document.getElementById("acct-exchange-amount");
  var toast = document.getElementById("acct-toast");
  var toastTimer = null;

  var HOLDER = "SOKHA CHAN";

  // shown when there is no backend (GitHub Pages) — same seed data as the server
  var DEMO_ACCOUNTS = [
    { id: "000123456789", label: "USD · Current", currency: "USD", balance: 1284.5 },
    { id: "000987654321", label: "KHR · Savings", currency: "KHR", balance: 4120000 },
    { id: "000555000111", label: "USD · Savings", currency: "USD", balance: 320.75 }
  ];

  function money(value, currency) {
    var n = Number(value) || 0;
    if (currency === "KHR") {
      return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 1900);
  }

  function copyTarget(node) {
    var value = node.getAttribute("data-copy-value") || "";
    function done() { showToast("Account number copied"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (e) {
        showToast("Copy failed");
      }
    }
  }

  function render(accounts) {
    var khr = accounts.filter(function (a) { return a.currency === "KHR"; });
    var usd = accounts.filter(function (a) { return a.currency === "USD"; });
    var khrTotal = khr.reduce(function (s, a) { return s + (Number(a.balance) || 0); }, 0);
    var usdTotal = usd.reduce(function (s, a) { return s + (Number(a.balance) || 0); }, 0);

    balEl.textContent = money(khrTotal, "KHR");
    exEl.textContent = money(usdTotal, "USD");
    titleEl.textContent = "List of Accounts (" + accounts.length + ")";

    // KHR first, then USD — same order as the reference screen
    var ordered = khr.concat(usd);
    var defId = (accounts.filter(function (a) {
      return (a.label || "").indexOf("Current") > -1;
    })[0] || accounts[0] || {}).id;

    listEl.innerHTML = "";
    ordered.forEach(function (a) {
      var item = document.createElement("article");
      item.className = "acct-item";

      var left = document.createElement("div");
      if (a.id === defId) {
        var badge = document.createElement("span");
        badge.className = "acct-badge";
        badge.textContent = "Default";
        left.appendChild(badge);
      }
      var name = document.createElement("p");
      name.className = "acct-name";
      name.textContent = HOLDER;
      var num = document.createElement("p");
      num.className = "acct-number";
      num.textContent = a.id;
      var bal = document.createElement("p");
      bal.className = "acct-bal";
      bal.textContent = money(a.balance, a.currency) + " ";
      var cur = document.createElement("span");
      cur.textContent = a.currency;
      bal.appendChild(cur);
      left.appendChild(name);
      left.appendChild(num);
      left.appendChild(bal);

      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "acct-copy";
      copyBtn.setAttribute("aria-label", "Copy account number " + a.id);
      copyBtn.setAttribute("data-copy-value", a.id);
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
      copyBtn.addEventListener("click", function () { copyTarget(copyBtn); });

      item.appendChild(left);
      item.appendChild(copyBtn);
      listEl.appendChild(item);
    });
  }

  var loading = false;
  function openPage() {
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    if (loading) return;
    loading = true;
    fetch("/api/internal/accounts", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var accounts = data && data.accounts && data.accounts.length ? data.accounts : DEMO_ACCOUNTS;
        render(accounts);
      })
      .catch(function () {
        render(DEMO_ACCOUNTS);
      })
      .then(function () { loading = false; });
  }

  function closePage() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
  }

  var back = document.getElementById("acct-back");
  if (back) back.addEventListener("click", closePage);
  var home = document.getElementById("acct-home");
  if (home) {
    home.addEventListener("click", function () {
      closePage();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // "THÊM" on the home card is rendered by React: delegate and stop its toast
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-testid="button-add-account"]') : null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openPage();
    },
    true
  );

  window.mbAccountPage = { open: openPage, close: closePage };
})();
