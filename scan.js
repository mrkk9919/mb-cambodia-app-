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

  var payLayer = document.getElementById("qr-pay");
  var payClose = document.getElementById("pay-close");
  var payName = document.getElementById("pay-name");
  var paySub = document.getElementById("pay-sub");
  var payAvatar = document.getElementById("pay-avatar");
  var payAmount = document.getElementById("pay-amount");
  var payCur = document.getElementById("pay-cur");
  var payRef = document.getElementById("pay-ref");
  var payConfirm = document.getElementById("pay-confirm");
  var payDone = document.getElementById("pay-done");
  var successAmount = document.getElementById("success-amount");
  var successTo = document.getElementById("success-to");
  var successRef = document.getElementById("success-ref");
  var successTime = document.getElementById("success-time");

  var state = {
    stream: null,
    track: null,
    raf: 0,
    running: false,
    lastTick: 0,
    objectUrl: null,
    torch: false,
    paying: false,
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
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() +
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

  /* ---------- payment sheet ---------- */

  function openPay(info) {
    state.current = info;
    payName.textContent = info.merchant;
    paySub.textContent = info.kind === "khqr"
      ? "KHQR" + (info.city ? " \u00b7 " + info.city : "")
      : "Scanned link";
    payAvatar.textContent = initials(info.merchant);
    payCur.textContent = symbol(info.currency);
    payAmount.value = info.amount ? money(info.amount, info.currency) : "";
    payRef.textContent = makeRef();
    payConfirm.disabled = !(Number(String(payAmount.value).replace(/,/g, "")) > 0);
    payLayer.classList.remove("done");
    payLayer.classList.add("show");
    setTimeout(function () { payAmount.focus(); }, 320);
  }

  function closePay() {
    payLayer.classList.remove("show", "done");
    state.current = null;
    state.paying = false;
    payConfirm.disabled = false;
    payConfirm.textContent = "Pay now";
    clearSelected();
    startCamera();
  }

  payAmount.addEventListener("input", function () {
    var cleaned = payAmount.value.replace(/[^0-9.]/g, "");
    if (cleaned !== payAmount.value) payAmount.value = cleaned;
    payConfirm.disabled = !(Number(cleaned) > 0);
  });

  payClose.addEventListener("click", closePay);

  payConfirm.addEventListener("click", function () {
    if (state.paying || !state.current) return;
    var value = Number(String(payAmount.value).replace(/,/g, ""));
    if (!(value > 0)) return;
    state.paying = true;
    payConfirm.disabled = true;
    payConfirm.textContent = "Processing\u2026";

    setTimeout(function () {
      successAmount.textContent = symbol(state.current.currency) + " " + money(value, state.current.currency);
      successTo.textContent = "to " + state.current.merchant;
      successRef.textContent = payRef.textContent;
      successTime.textContent = nowLabel();
      payLayer.classList.add("done");
      payConfirm.textContent = "Pay now";
    }, 1300);
  });

  payDone.addEventListener("click", function () {
    payLayer.classList.remove("show", "done");
    state.current = null;
    state.paying = false;
    closeScanner();
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
    openPay(info);
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
    payLayer.classList.remove("show", "done");
    state.current = null;
    clearSelected();
  }

  backBtn.addEventListener("click", function () {
    if (payLayer.classList.contains("show")) { closePay(); return; }
    closeScanner();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (payLayer.classList.contains("show")) { closePay(); return; }
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

  window.mbScanQR = { open: openScanner, close: closeScanner };
})();
