/* ============================================================
   Scan QR + payment flow
   - live camera capture (getUserMedia) decoded with jsQR
   - upload a QR image and decode it the same way
   - KHQR / EMVCo payload parsing, then a payment sheet
   ============================================================ */
(function () {
  "use strict";

  var overlay = document.getElementById("qr-scan");
  if (!overlay || overlay.dataset.ready) return;
  overlay.dataset.ready = "1";

  var backBtn = overlay.querySelector(".back-button");
  var flashBtn = document.getElementById("qr-flash");
  var flashState = document.getElementById("qr-flash-state");
  var uploadBtn = document.getElementById("qr-upload");
  var fileInput = document.getElementById("qr-file");
  var instruction = document.getElementById("qr-instruction");
  var cameraHint = document.getElementById("qr-camera-hint");
  var video = document.getElementById("qr-camera");
  var selectedBox = document.getElementById("qr-selected");
  var selectedImg = document.getElementById("qr-selected-img");
  var selectedFile = document.getElementById("qr-selected-file");
  var selectedName = document.getElementById("qr-selected-name");
  var toast = document.getElementById("qr-toast");

  /* --- 收付款流程（3 屏：填金额 → 确认 → 成功） --- */
  var flow = document.getElementById("pay-flow");
  var stepAmount = document.getElementById("pf-step-amount");
  var stepConfirm = document.getElementById("pf-step-confirm");
  var stepSuccess = document.getElementById("pf-step-success");
  var pfMerchant = document.getElementById("pf-merchant");
  var pfMerchantIcon = document.getElementById("pf-merchant-icon");
  var pfBank = document.getElementById("pf-bank");
  var pfBankSub = document.getElementById("pf-bank-sub");
  var pfCur = document.getElementById("pf-cur");
  var pfAmount = document.getElementById("pf-amount");
  var pfNote = document.getElementById("pf-note");
  var pfFromAccount = document.getElementById("pf-from-account");
  var pfNext = document.getElementById("pf-next");
  var pfConfirmMerchant = document.getElementById("pf-confirm-merchant");
  var pfConfirmIcon = document.getElementById("pf-confirm-icon");
  var pfConfirmBank = document.getElementById("pf-confirm-bank");
  var pfSumAmount = document.getElementById("pf-sum-amount");
  var pfSumFrom = document.getElementById("pf-sum-from");
  var pfSumTotal = document.getElementById("pf-sum-total");
  var pfConfirmNote = document.getElementById("pf-confirm-note");
  var pfStatus = document.getElementById("pf-status");
  var pfConfirmBtn = document.getElementById("pf-confirm");
  var pfSuccessAmount = document.getElementById("pf-success-amount");
  var pfSuccessMerchant = document.getElementById("pf-success-merchant");
  var pfSuccessBank = document.getElementById("pf-success-bank");
  var pfSuccessBankSub = document.getElementById("pf-success-bank-sub");
  var pfDemoNote = document.getElementById("pf-demo-note");
  var pfSuccessRef = document.getElementById("pf-success-ref");
  var pfSuccessTime = document.getElementById("pf-success-time");
  var pfSuccessFrom = document.getElementById("pf-success-from");
  var pfShare = document.getElementById("pf-share");
  var pfDone = document.getElementById("pf-done");

  var envMode = null;

  var state = {
    stream: null,
    track: null,
    raf: 0,
    running: false,
    lastTick: 0,
    objectUrl: null,
    torch: false,
    paying: false,
    payment: null,
    pollTimer: 0,
    flow: null,
    current: null
  };

  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });
  var toastTimer = 0;

  /* ---------- helpers ---------- */

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 2400);
  }

  function money(amount, currency) {
    if (amount === null || amount === undefined || amount === "") return "";
    var n = Number(amount);
    if (isNaN(n)) return "";
    var digits = currency === "KHR" ? 0 : 2;
    return n.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function symbol(currency) { return currency === "KHR" ? "\u17DB" : "$"; }

  function makeRef() {
    var t = Date.now().toString(36).toUpperCase().slice(-6);
    var r = Math.random().toString(36).toUpperCase().slice(2, 5);
    return "MB" + t + r;
  }

  function nowLabel() {
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : "" + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ---------- payload parsing ---------- */

  function tlv(text) {
    var out = {};
    var i = 0;
    while (i + 4 <= text.length) {
      var id = text.substr(i, 2);
      var len = parseInt(text.substr(i + 2, 2), 10);
      if (isNaN(len)) break;
      out[id] = text.substr(i + 4, len);
      i += 4 + len;
    }
    return out;
  }

  function parsePayload(raw) {
    var text = (raw || "").trim();
    if (!text) return null;

    if (/^000201/.test(text)) {
      var f = tlv(text);
      var currency = f["53"] === "116" ? "KHR" : "USD";
      var amount = f["54"] ? Number(f["54"]) : null;
      if (isNaN(amount)) amount = null;
      return {
        kind: "khqr",
        merchant: f["59"] || "KHQR merchant",
        city: f["60"] || "",
        amount: amount,
        currency: currency,
        accountId: f["29"] || "",
        raw: text
      };
    }

    if (/^https?:\/\//i.test(text)) {
      var host = text.replace(/^https?:\/\//i, "").split("/")[0];
      return { kind: "url", merchant: host, city: "", amount: null, currency: "USD", raw: text };
    }

    return null;
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "QR";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ---------- KHQR payment flow: amount -> confirm -> success ---------- */

  var API_BASE = window.MB_API_BASE || "/api";
  var fromAccount = { id: "", currency: "USD", label: "USD Account (\u2022\u2022\u20221234)" };
  var lastReceipt = null;

  function apiFetch(path, options) {
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

  function setStatus(text, tone) {
    if (!pfStatus) return;
    pfStatus.textContent = text || "";
    pfStatus.hidden = !text;
    pfStatus.dataset.tone = tone || "";
  }

  function stopPolling() {
    if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = 0; }
  }

  function showStep(name) {
    stepAmount.hidden = name !== "amount";
    stepConfirm.hidden = name !== "confirm";
    stepSuccess.hidden = name !== "success";
    flow.dataset.step = name;
  }

  // 付款账户从内部账户表里取第一个 USD 账户
  function loadFromAccount() {
    apiFetch("/internal/accounts").then(function (data) {
      var list = (data && data.accounts) || [];
      var acc = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].currency === "USD") { acc = list[i]; break; }
      }
      if (!acc && list.length) acc = list[0];
      if (!acc) return;
      fromAccount = {
        id: acc.id,
        currency: acc.currency,
        label: acc.currency + " Account (\u2022\u2022\u2022" + String(acc.id).slice(-4) + ")"
      };
      pfFromAccount.textContent = fromAccount.label;
      pfSumFrom.textContent = fromAccount.label;
      pfSuccessFrom.textContent = fromAccount.label;
    }).catch(function () {});
  }

  function openFlow(info) {
    state.current = info;
    state.payment = null;
    state.paying = false;
    lastReceipt = null;
    stopPolling();
    setStatus("");

    var currency = info.currency || "USD";
    var bank = (info.bank && info.bank.name) || "Bakong member bank";
    var bankSub = (info.bank && info.bank.short) || "";

    pfMerchant.textContent = info.merchant;
    pfMerchantIcon.textContent = initials(info.merchant);
    pfConfirmMerchant.textContent = info.merchant;
    pfConfirmIcon.textContent = initials(info.merchant);
    pfBank.textContent = bank;
    pfConfirmBank.textContent = bank;
    pfSuccessBank.textContent = bank;
    pfBankSub.textContent = bankSub;
    pfBankSub.hidden = !bankSub;
    if (pfSuccessBankSub) {
      pfSuccessBankSub.textContent = bankSub;
      pfSuccessBankSub.hidden = !bankSub;
    }

    pfCur.textContent = symbol(currency);
    pfAmount.value = info.amount ? money(info.amount, currency) : "";
    pfNote.value = "";
    pfNext.disabled = !(Number(String(pfAmount.value).replace(/,/g, "")) > 0);
    pfConfirmBtn.disabled = false;
    pfConfirmBtn.textContent = "Confirm Payment";
    pfSumFrom.textContent = fromAccount.label;
    pfSuccessFrom.textContent = fromAccount.label;

    showStep("amount");
    flow.classList.add("open");
    flow.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    stopCamera();
    loadFromAccount();
    setTimeout(function () { if (!info.amount) pfAmount.focus(); }, 260);
  }

  function closeFlow() {
    stopPolling();
    flow.classList.remove("open");
    flow.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    state.payment = null;
    state.paying = false;
    state.current = null;
    setStatus("");
  }

  function readAmount() {
    return Number(String(pfAmount.value).replace(/,/g, ""));
  }

  function openBakong() {
    if (!state.payment || !state.payment.deeplink) return;
    window.open(state.payment.deeplink, "_blank", "noopener");
    setStatus("Approve it in Bakong, then come back \u2014 this screen updates automatically.");
  }

  function goConfirm() {
    var value = readAmount();
    if (!(value > 0) || !state.current) return;
    var currency = state.current.currency || "USD";
    var text = symbol(currency) + " " + money(value, currency);
    pfSumAmount.textContent = text;
    pfSumTotal.textContent = text;
    var note = pfNote.value.trim();
    pfConfirmNote.textContent = note;
    pfConfirmNote.hidden = !note;
    pfConfirmBtn.disabled = false;
    pfConfirmBtn.textContent = "Confirm Payment";
    setStatus("");
    showStep("confirm");
  }

  function simulatePayment(value) {
    state.paying = true;
    pfConfirmBtn.disabled = true;
    pfConfirmBtn.textContent = "Processing…";
    setStatus("Static preview on GitHub Pages — no real Bakong call.");
    setTimeout(function () {
      state.paying = false;
      if (!state.current || !flow.classList.contains("open")) return;
      showSuccess({
        amount: value,
        currency: state.current.currency || "USD",
        merchant: state.current.merchant,
        recipientBank: state.current.bank || { name: pfBank.textContent, short: pfBankSub.textContent || "" },
        ref: "DEMO-" + makeRef(),
        status: "paid"
      });
    }, 1500);
  }

  function startPayment() {
    if (state.paying || !state.current) return;
    var value = readAmount();
    if (!(value > 0)) return;
    if (envMode === "demo-static") { simulatePayment(value); return; }

    state.paying = true;
    pfConfirmBtn.disabled = true;
    pfConfirmBtn.textContent = "Processing\u2026";
    setStatus("Verifying the QR code with Bakong\u2026");

    apiFetch("/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr: state.current.raw, amount: value, note: pfNote.value.trim() })
    }).then(function (payment) {
      state.payment = payment;
      if (payment.recipientBank && payment.recipientBank.name) {
        pfSuccessBank.textContent = payment.recipientBank.name;
        pfBank.textContent = payment.recipientBank.name;
        pfConfirmBank.textContent = payment.recipientBank.name;
      }
      if (payment.deeplink) {
        pfConfirmBtn.disabled = false;
        pfConfirmBtn.textContent = "Open Bakong to pay";
        setStatus("Tap the button to approve it in Bakong. This screen only completes when Bakong confirms the transfer \u2014 never simulated.");
      } else {
        pfConfirmBtn.textContent = "Waiting for payment\u2026";
        setStatus("Waiting for the transfer to arrive. Success is shown only after Bakong confirms it.");
      }
      pollPayment();
    }).catch(function (err) {
      state.paying = false;
      pfConfirmBtn.disabled = false;
      pfConfirmBtn.textContent = "Try again";
      setStatus(err.message || "Payment service unavailable.", "error");
    });
  }

  function pollPayment() {
    if (!state.payment) return;
    var id = state.payment.id;
    state.pollTimer = setTimeout(function () {
      apiFetch("/payments/" + id).then(function (payment) {
        // 流程已关闭或已换成别的支付单时，丢掉这次响应
        if (!state.payment || state.payment.id !== id || !flow.classList.contains("open")) return;
        state.payment = payment;
        if (payment.status === "paid") { showSuccess(payment); return; }
        if (payment.status === "expired") {
          state.paying = false;
          pfConfirmBtn.disabled = false;
          pfConfirmBtn.textContent = "Try again";
          setStatus("Bakong did not receive this payment before the QR expired. Nothing was charged.", "error");
          return;
        }
        pollPayment();
      }).catch(function () {
        pollPayment();
      });
    }, 2000);
  }

  function showSuccess(payment) {
    stopPolling();
    state.paying = false;
    var currency = payment.currency || (state.current && state.current.currency) || "USD";
    pfSuccessAmount.textContent = symbol(currency) + " " + money(payment.amount, currency);
    pfSuccessMerchant.textContent = payment.merchant;
    pfSuccessBank.textContent = (payment.recipientBank && payment.recipientBank.name) || pfBank.textContent;
    if (pfSuccessBankSub) {
      var short = (payment.recipientBank && payment.recipientBank.short) ||
        (state.current && state.current.bank && state.current.bank.short) || "";
      pfSuccessBankSub.textContent = short;
      pfSuccessBankSub.hidden = !short;
    }
    pfSuccessRef.textContent = payment.ref;
    pfSuccessTime.textContent = nowLabel();
    pfSuccessFrom.textContent = fromAccount.label;
    lastReceipt = {
      amount: pfSuccessAmount.textContent,
      merchant: payment.merchant,
      bank: pfSuccessBank.textContent,
      ref: payment.ref,
      time: pfSuccessTime.textContent,
      from: fromAccount.label
    };
    if (pfDemoNote) pfDemoNote.hidden = !(envMode === "demo" || envMode === "demo-static");
    setStatus("");
    showStep("success");
  }

  function shareReceipt() {
    if (!lastReceipt) return;
    var text = "MB Bank Cambodia \u2014 payment receipt\n" +
      lastReceipt.amount + " to " + lastReceipt.merchant + "\n" +
      "Received by " + lastReceipt.bank + "\n" +
      "Transaction ID: " + lastReceipt.ref + "\n" +
      "Date & Time: " + lastReceipt.time + "\n" +
      "From: " + lastReceipt.from;
    if (navigator.share) {
      navigator.share({ title: "Payment receipt", text: text }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast("Receipt copied to clipboard");
      }).catch(function () { showToast("Transaction ID " + lastReceipt.ref); });
      return;
    }
    showToast("Transaction ID " + lastReceipt.ref);
  }

  // 扫码结果先问后端拿银行名（KHQR 里没有银行字段），拿不到再用本地解析结果
  var BANK_SUFFIXES = {
    acleda: ["ACLEDA Bank", "ACLEDA Plc."], aclb: ["ACLEDA Bank", "ACLEDA Plc."],
    aba: ["ABA Bank", "Advanced Bank of Asia"], ababank: ["ABA Bank", "Advanced Bank of Asia"],
    wing: ["Wing Bank", "Wing Bank (Cambodia) Plc."],
    ppcbank: ["PPCBank", "Phnom Penh Commercial Bank"], ppcb: ["PPCBank", "Phnom Penh Commercial Bank"],
    canadabank: ["Canadia Bank", "Canadia Bank Plc."], maybank: ["Maybank Cambodia", "Maybank (Cambodia) Plc."],
    ftb: ["FTB Bank", "Foreign Trade Bank of Cambodia"], cimb: ["CIMB Bank", "CIMB Bank Plc."],
    vattanac: ["Vattanac Bank", "Vattanac Bank"], sathapana: ["Sathapana Bank", "Sathapana Bank Plc."],
    hattha: ["Hattha Bank", "Hattha Bank Plc."], campubank: ["Campu Bank", "Cambodia Public Bank"],
    jtrust: ["J Trust Royal Bank", "J Trust Royal Bank"], phillip: ["Phillip Bank", "Phillip Bank Plc."],
    chipmong: ["Chip Mong Bank", "Chip Mong Commercial Bank"], firstbank: ["First Commercial Bank", "First Commercial Bank"],
    kbprasac: ["KB Prasac Bank", "KB Prasac Bank Plc."], devb: ["DEV Bank", "Bakong sandbox bank"],
    bakong: ["Bakong", "National Bank of Cambodia"]
  };

  function localBank(accountId) {
    var id = String(accountId || "");
    if (id.indexOf("@") === -1) return { name: "Bakong member bank", short: "" };
    var hit = BANK_SUFFIXES[id.split("@").pop().toLowerCase()];
    return hit ? { name: hit[0], short: hit[1] } : { name: "Bakong member bank", short: "" };
  }

  function resolveInfo(info) {
    if (!info.raw) { openFlow(info); return; }
    apiFetch("/scan/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qr: info.raw })
    }).then(function (data) {
      openFlow({
        merchant: data.merchant || info.merchant,
        amount: data.amount === null || data.amount === undefined ? info.amount : data.amount,
        currency: data.currency || info.currency,
        city: data.city || info.city,
        bank: data.bank,
        kind: info.kind,
        raw: info.raw
      });
    }).catch(function () {
      info.bank = localBank(info.accountId || info.bakongAccountId || "");
      openFlow(info);
    });
  }

  /* ---------- flow events ---------- */

  pfAmount.addEventListener("input", function () {
    var cleaned = pfAmount.value.replace(/[^0-9.]/g, "");
    if (cleaned !== pfAmount.value) pfAmount.value = cleaned;
    pfNext.disabled = !(Number(cleaned) > 0);
  });

  pfNext.addEventListener("click", goConfirm);

  pfConfirmBtn.addEventListener("click", function () {
    // 支付单已建好时，这个按钮用来去 Bakong 授权
    if (state.payment && state.payment.status === "pending") {
      if (state.payment.deeplink) openBakong();
      return;
    }
    startPayment();
  });

  pfDone.addEventListener("click", function () {
    closeFlow();
    closeScanner();
  });

  pfShare.addEventListener("click", shareReceipt);

  Array.prototype.forEach.call(flow.querySelectorAll(".pf-back"), function (btn) {
    btn.addEventListener("click", function () {
      if (flow.dataset.step === "confirm") {
        setStatus("");
        showStep("amount");
        return;
      }
      closeFlow();
      startCamera();
    });
  });

  /* ---------- camera ---------- */

  function cameraAvailable() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.jsQR);
  }

  function stopCamera() {
    state.running = false;
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
    if (state.track && state.track.applyConstraints && state.torch) {
      try { state.track.applyConstraints({ advanced: [{ torch: false }] }); } catch (e) {}
      state.torch = false;
    }
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
    state.track = null;
    video.srcObject = null;
    overlay.classList.remove("camera-on");
  }

  function startCamera() {
    if (!cameraAvailable()) {
      cameraHint.textContent = "Camera unavailable \u2014 upload a QR image instead.";
      cameraHint.hidden = false;
      return;
    }
    if (state.stream) return;

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false
    }).then(function (stream) {
      state.stream = stream;
      state.track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.muted = true;
      var playing = video.play();
      if (playing && playing.catch) playing.catch(function () {});
      overlay.classList.add("camera-on");
      cameraHint.hidden = true;
      state.running = true;
      state.lastTick = 0;
      state.raf = requestAnimationFrame(tick);
    }).catch(function () {
      cameraHint.textContent = "Camera unavailable \u2014 upload a QR image instead.";
      cameraHint.hidden = false;
    });
  }

  function tick(ts) {
    if (!state.running) return;
    if (ts - state.lastTick > 120 && video.readyState >= 2 && video.videoWidth) {
      state.lastTick = ts;
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      var scale = Math.min(1, 480 / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var code = null;
      try {
        code = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
      } catch (e) {}
      if (code && code.data) {
        stopCamera();
        handlePayload(code.data);
        return;
      }
    }
    state.raf = requestAnimationFrame(tick);
  }

  function decodeImage(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 900 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = null;
        try {
          code = window.jsQR ? window.jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" }) : null;
        } catch (e) {}
        URL.revokeObjectURL(url);
        resolve(code && code.data ? code.data : null);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /* ---------- payload handling ---------- */

  function handlePayload(text) {
    var info = parsePayload(text);
    if (!info) {
      showToast("This QR code is not a supported payment code.");
      startCamera();
      return;
    }
    stopCamera();
    resolveInfo(info);
  }

  /* ---------- upload ---------- */

  function clearSelected() {
    if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
    selectedBox.hidden = true;
    selectedFile.hidden = true;
    selectedImg.removeAttribute("src");
    selectedName.textContent = "";
    instruction.textContent = "Align frame with QR code";
  }

  uploadBtn.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!window.jsQR) { showToast("QR decoder failed to load."); return; }

    stopCamera();
    clearSelected();
    state.objectUrl = URL.createObjectURL(file);
    selectedImg.src = state.objectUrl;
    selectedImg.alt = "Selected image: " + file.name;
    selectedBox.hidden = false;
    selectedName.textContent = file.name;
    selectedName.title = file.name;
    selectedFile.hidden = false;
    instruction.textContent = "Reading QR code\u2026";

    decodeImage(file).then(function (text) {
      if (!text) {
        instruction.textContent = "No QR code found";
        showToast("No QR code found in that image. Try another one.");
        return;
      }
      instruction.textContent = "Image selected";
      handlePayload(text);
    });
  });

  /* ---------- flash / torch ---------- */

  flashBtn.addEventListener("click", function () {
    var on = !overlay.classList.contains("flash");
    overlay.classList.toggle("flash", on);
    flashBtn.classList.toggle("active", on);
    flashBtn.setAttribute("aria-pressed", on ? "true" : "false");
    flashState.textContent = on ? "On" : "";
    if (state.track && state.track.applyConstraints) {
      try {
        state.track.applyConstraints({ advanced: [{ torch: on }] }).then(function () {
          state.torch = on;
        }).catch(function () {});
      } catch (e) {}
    }
  });

  /* ---------- open / close ---------- */

  function openScanner() {
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    startCamera();
    setTimeout(function () { backBtn.focus(); }, 80);
  }

  function closeScanner() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    stopCamera();
    overlay.classList.remove("flash");
    flashBtn.classList.remove("active");
    flashBtn.setAttribute("aria-pressed", "false");
    flashState.textContent = "";
    closeFlow();
    clearSelected();
  }

  backBtn.addEventListener("click", function () {
    if (flow.classList.contains("open")) { closeFlow(); return; }
    closeScanner();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (flow.classList.contains("open")) { closeFlow(); return; }
    if (overlay.classList.contains("open")) closeScanner();
  });

  // open the scanner from the app's QR entry points without letting the
  // React handler show its "not connected" toast
  document.addEventListener("click", function (e) {
    if (overlay.classList.contains("open")) return;
    var el = e.target && e.target.closest ? e.target.closest("[aria-label]") : null;
    if (!el || el.closest("#qr-scan")) return;
    var label = (el.getAttribute("aria-label") || "").toLowerCase();
    if (label.indexOf("qu\u00e9t") > -1 || label.indexOf("scan") > -1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openScanner();
    }
  }, true);

  /* ---------- my QR code (receive) ---------- */

  var myqrSheet = document.getElementById("myqr");
  var myqrBtn = document.getElementById("qr-myqr");
  var myqrImg = document.getElementById("myqr-img");
  var myqrLoading = document.getElementById("myqr-loading");
  var myqrName = document.getElementById("myqr-name");
  var myqrAccount = document.getElementById("myqr-account");
  var myqrStatus = document.getElementById("myqr-status");
  var myqrClose = document.getElementById("myqr-close");

  function drawQr(text) {
    if (!window.qrcode) return false;
    var qr = window.qrcode(0, "M");
    qr.addData(text);
    qr.make();
    myqrImg.src = qr.createDataURL(8, 4);
    return true;
  }

  function openMyQr() {
    if (envMode === "demo-static") {
      showToast("My QR Code needs the backend service.");
      return;
    }
    myqrStatus.textContent = "";
    myqrImg.removeAttribute("data-ready");
    myqrImg.removeAttribute("src");
    myqrLoading.hidden = false;
    myqrSheet.classList.add("open");
    myqrSheet.setAttribute("aria-hidden", "false");
    apiFetch("/qr/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }).then(function (data) {
      if (!drawQr(data.qr)) {
        myqrStatus.textContent = "QR renderer failed to load.";
        return;
      }
      myqrImg.setAttribute("data-ready", "1");
      myqrName.textContent = data.merchant || "MB Bank Cambodia";
      myqrAccount.textContent = data.account || "";
    }).catch(function (err) {
      myqrStatus.textContent = err.message || "Unable to generate your QR code.";
    }).then(function () {
      myqrLoading.hidden = true;
    });
  }

  function closeMyQr() {
    myqrSheet.classList.remove("open");
    myqrSheet.setAttribute("aria-hidden", "true");
  }

  if (myqrBtn) myqrBtn.addEventListener("click", openMyQr);
  if (myqrClose) myqrClose.addEventListener("click", closeMyQr);
  if (myqrSheet) {
    Array.prototype.forEach.call(myqrSheet.querySelectorAll("[data-myqr-close]"), function (el) {
      el.addEventListener("click", closeMyQr);
    });
  }

  apiFetch("/health").then(function (d) {
    envMode = (d && d.bakong && d.bakong.mode) || null;
  }).catch(function () {
    // no backend (e.g. GitHub Pages): walk the UI as a labelled demo
    envMode = "demo-static";
  });

  window.mbScanQR = { open: openScanner, close: closeScanner };
})();
