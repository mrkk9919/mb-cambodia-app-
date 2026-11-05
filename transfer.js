/* ============================================================
   Internal transfer
   - 同币种账户互转，走 server 的 /api/internal/*
   - 只是原型账本，不经过 Bakong、不动真实资金
   ============================================================ */
(function () {
  "use strict";

  var API_BASE = window.MB_API_BASE || "/api";

  var accountsBox = document.getElementById("tf-accounts");
  var fromSel = document.getElementById("tf-from");
  var toSel = document.getElementById("tf-to");
  var amountInput = document.getElementById("tf-amount");
  var curLabel = document.getElementById("tf-cur");
  var noteInput = document.getElementById("tf-note");
  var submitBtn = document.getElementById("tf-submit");
  var statusBox = document.getElementById("tf-status");
  var historyList = document.getElementById("tf-history");

  var sheet = document.getElementById("tf-sheet");
  var sheetDone = document.getElementById("tf-sheet-done");

  var state = { accounts: [], busy: false };

  function api(path, options) {
    return fetch(API_BASE + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.error || "HTTP " + res.status);
          err.code = body.code;
          throw err;
        }
        return body;
      });
    });
  }

  function money(n, currency) {
    var digits = currency === "KHR" ? 0 : 2;
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function symbol(currency) { return currency === "KHR" ? "\u17DB" : "$"; }

  function setStatus(text, tone) {
    statusBox.textContent = text || "";
    statusBox.hidden = !text;
    statusBox.dataset.tone = tone || "";
  }

  function byId(id) {
    return state.accounts.filter(function (a) { return a.id === id; })[0] || null;
  }

  /* ---------- 渲染 ---------- */

  function renderAccounts() {
    if (!state.accounts.length) {
      accountsBox.innerHTML = '<p class="tf-empty">No accounts returned by the server.</p>';
      return;
    }
    accountsBox.innerHTML = state.accounts
      .map(function (a) {
        return (
          '<div class="tf-account">' +
          '<div><div class="tf-account-name">' + a.label + "</div>" +
          '<div class="tf-account-id">' + a.id + "</div></div>" +
          '<div class="tf-account-balance">' + symbol(a.currency) + " " + money(a.balance, a.currency) + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function fillSelectors(preserve) {
    var prevFrom = preserve ? fromSel.value : state.accounts[0] && state.accounts[0].id;
    var prevTo = preserve ? toSel.value : null;

    fromSel.innerHTML = state.accounts
      .map(function (a) {
        return '<option value="' + a.id + '">' + a.label + " \u00b7 " + symbol(a.currency) + " " + money(a.balance, a.currency) + "</option>";
      })
      .join("");

    if (prevFrom && byId(prevFrom)) fromSel.value = prevFrom;
    syncToOptions(prevTo);
  }

  function syncToOptions(preferred) {
    var from = byId(fromSel.value);
    if (!from) return;
    var options = state.accounts.filter(function (a) {
      return a.id !== from.id && a.currency === from.currency;
    });
    toSel.innerHTML = options.length
      ? options
          .map(function (a) {
            return '<option value="' + a.id + '">' + a.label + " \u00b7 " + symbol(a.currency) + " " + money(a.balance, a.currency) + "</option>";
          })
          .join("")
      : '<option value="">No same-currency account</option>';

    if (preferred && options.some(function (a) { return a.id === preferred; })) toSel.value = preferred;
    curLabel.textContent = symbol(from.currency);
    validate();
  }

  function renderHistory() {
    api("/internal/transactions").then(function (data) {
      var list = data.transfers || [];
      if (!list.length) {
        historyList.innerHTML = '<li class="tf-empty">No transfers yet.</li>';
        return;
      }
      historyList.innerHTML = list
        .map(function (t) {
          var fromA = byId(t.from);
          var toA = byId(t.to);
          var when = new Date(t.createdAt);
          return (
            "<li>" +
            '<div class="tf-row"><strong>' + symbol(t.currency) + " " + money(t.amount, t.currency) + "</strong><span>" + t.ref + "</span></div>" +
            '<div class="tf-row"><span>' + (fromA ? fromA.label : t.from) + " \u2192 " + (toA ? toA.label : t.to) + "</span><span>" +
            when.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) +
            "</span></div>" +
            (t.note ? '<div class="tf-row"><span>' + escapeHtml(t.note) + "</span></div>" : "") +
            "</li>"
          );
        })
        .join("");
    }).catch(function () {
      historyList.innerHTML = '<li class="tf-empty">Could not load transfer history.</li>';
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 校验 ---------- */

  function validate() {
    var from = byId(fromSel.value);
    var value = Number(String(amountInput.value).replace(/,/g, ""));
    var ok = Boolean(from) && Boolean(toSel.value) && value > 0 && value <= from.balance && !state.busy;
    submitBtn.disabled = !ok;
    return ok;
  }

  /* ---------- 提交 ---------- */

  function submit() {
    if (!validate()) return;
    var from = byId(fromSel.value);
    var value = Number(String(amountInput.value).replace(/,/g, ""));

    state.busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Transferring\u2026";
    setStatus("");

    api("/internal/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromSel.value,
        to: toSel.value,
        amount: value,
        note: noteInput.value.trim()
      })
    }).then(function (data) {
      state.accounts = data.accounts || state.accounts;
      renderAccounts();
      fillSelectors(true);
      renderHistory();
      showReceipt(data.transfer);
      amountInput.value = "";
      noteInput.value = "";
    }).catch(function (err) {
      setStatus(err.message || "Transfer failed.", "error");
    }).then(function () {
      state.busy = false;
      submitBtn.textContent = "Transfer";
      validate();
    });
  }

  function showReceipt(t) {
    var from = byId(t.from);
    var to = byId(t.to);
    document.getElementById("tf-sheet-amount").textContent = symbol(t.currency) + " " + money(t.amount, t.currency);
    document.getElementById("tf-sheet-ref").textContent = t.ref;
    document.getElementById("tf-sheet-from").textContent = from ? from.label : t.from;
    document.getElementById("tf-sheet-to").textContent = to ? to.label : t.to;
    document.getElementById("tf-sheet-time").textContent = new Date(t.createdAt).toLocaleString("en-GB", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    sheet.classList.add("show");
    sheet.setAttribute("aria-hidden", "false");
  }

  /* ---------- 事件 ---------- */

  fromSel.addEventListener("change", function () { syncToOptions(); });
  toSel.addEventListener("change", validate);
  amountInput.addEventListener("input", function () {
    var cleaned = amountInput.value.replace(/[^0-9.]/g, "");
    if (cleaned !== amountInput.value) amountInput.value = cleaned;
    validate();
  });
  amountInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  });
  submitBtn.addEventListener("click", submit);
  sheetDone.addEventListener("click", function () {
    sheet.classList.remove("show");
    sheet.setAttribute("aria-hidden", "true");
  });

  /* ---------- 初始化 ---------- */

  api("/internal/accounts").then(function (data) {
    state.accounts = data.accounts || [];
    renderAccounts();
    fillSelectors(false);
    renderHistory();
    validate();
  }).catch(function () {
    accountsBox.innerHTML = '<p class="tf-empty">Transfer service unreachable. Start the server (<code>node server/index.js</code>) to use this screen.</p>';
  });
})();
