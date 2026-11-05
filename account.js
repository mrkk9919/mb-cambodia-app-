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
  var form = document.getElementById("acct-form");
  var addBtn = document.getElementById("acct-add-btn");
  var formErr = document.getElementById("acct-f-err");
  var fName = document.getElementById("acct-f-name");
  var fBal = document.getElementById("acct-f-bal");
  var fSubmit = document.getElementById("acct-f-submit");
  var typeGroup = document.getElementById("acct-f-type");
  var curGroup = document.getElementById("acct-f-cur");
  var currentAccounts = null;

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
    currentAccounts = accounts;
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
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        copyTarget(copyBtn);
      });

      item.setAttribute("data-account-id", a.id);
      item.addEventListener("click", function () { selectAccount(a); });

      item.appendChild(left);
      item.appendChild(copyBtn);
      listEl.appendChild(item);
    });
  }

  /* ---------- add account ---------- */

  function segValue(group) {
    var on = group.querySelector("button.on");
    return on ? on.getAttribute("data-value") : "";
  }

  function showForm(show) {
    if (!form || !listEl) return;
    form.hidden = !show;
    listEl.hidden = show;
    if (addBtn) addBtn.hidden = show;
    if (show) {
      formErr.textContent = "";
      fBal.value = "0";
      if (titleEl) titleEl.textContent = "New Account";
    }
  }

  function localAdd(payload) {
    var accounts = currentAccounts ? currentAccounts.slice() : DEMO_ACCOUNTS.slice();
    var id;
    do {
      id = "000" + String(Math.floor(100000000 + Math.random() * 899999999));
    } while (accounts.some(function (a) { return a.id === id; }));
    accounts.push({
      id: id,
      label: payload.currency + " \u00b7 " + payload.type,
      currency: payload.currency,
      balance: Number(payload.balance) || 0,
      name: payload.name
    });
    render(accounts);
  }

  function submitForm(e) {
    e.preventDefault();
    var payload = {
      name: (fName && fName.value.trim()) || HOLDER,
      type: segValue(typeGroup) || "Payment",
      currency: segValue(curGroup) || "USD",
      balance: fBal ? fBal.value : "0"
    };
    var bal = Number(payload.balance);
    if (!Number.isFinite(bal) || bal < 0) {
      formErr.textContent = "Initial balance must be 0 or more.";
      return;
    }
    formErr.textContent = "";
    fSubmit.disabled = true;

    fetch("/api/internal/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error((body && body.error) || ("HTTP " + res.status));
          return body;
        });
      })
      .then(function (body) {
        var accounts = body.accounts && body.accounts.length ? body.accounts : null;
        if (accounts) render(accounts);
        else localAdd(payload);
        showForm(false);
        showToast("Account added");
      })
      .catch(function (err) {
        // no backend (static Pages): add into the demo list
        localAdd(payload);
        showForm(false);
        showToast("Account added (demo only)");
        if (err && err.message) console.warn("[account] create failed:", err.message);
      })
      .then(function () {
        fSubmit.disabled = false;
        if (titleEl) titleEl.textContent = "List of Accounts (" + ((currentAccounts && currentAccounts.length) || 0) + ")";
      });
  }

  if (addBtn) addBtn.addEventListener("click", function () { showForm(true); });
  if (form) form.addEventListener("submit", submitForm);
  var cancelBtn = document.getElementById("acct-f-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      showForm(false);
      if (titleEl) titleEl.textContent = "List of Accounts (" + ((currentAccounts && currentAccounts.length) || 0) + ")";
    });
  }
  [typeGroup, curGroup].forEach(function (group) {
    if (!group) return;
    group.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-value]");
      if (!btn) return;
      Array.prototype.forEach.call(group.querySelectorAll("button"), function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
    });
  });

  // picking a card switches the account selected in the home selector
  function selectAccount(a) {
    var selectedLabel = /ti\u1ebft ki\u1ec7m|savings/i.test(a.label || "")
      ? "T\xe0i kho\u1ea3n ti\u1ebft ki\u1ec7m: " + a.id
      : "T\xe0i kho\u1ea3n thanh to\xe1n: " + a.id;

    closePage();

    var sel = document.querySelector('[data-testid="button-account-selector"]');
    if (!sel) return;

    var optId = a.id === "000123456789" ? "option-account-payment"
      : (a.id === "000987654321" ? "option-account-savings" : "");

    if (optId) {
      // let React own the state when its own menu knows this account
      sel.click();
      window.setTimeout(function () {
        var opt = document.querySelector('[data-testid="' + optId + '"]');
        if (opt) opt.click();
      }, 80);
    } else {
      var span = sel.querySelector("span");
      if (span) span.textContent = selectedLabel;
    }
  }

  var loading = false;
  function openPage() {
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    showForm(false);
    if (titleEl) titleEl.textContent = "List of Accounts" + (currentAccounts ? " (" + currentAccounts.length + ")" : "");
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
