(function () {
  "use strict";

  var page = document.getElementById("referral-page");
  if (!page) return;

  var linkInput = document.getElementById("referral-link");
  var codeInput = document.getElementById("referral-code");
  var qrImage = document.getElementById("referral-qr-image");
  var toast = document.getElementById("referral-toast");
  var shareButton = document.getElementById("referral-share");
  var toastTimer = 0;
  var referralUrl = new URL("./?ref=06855788", window.location.href).toString();

  linkInput.value = referralUrl;

  if (window.qrcode) {
    try {
      var qr = window.qrcode(0, "M");
      qr.addData(referralUrl);
      qr.make();
      qrImage.src = qr.createDataURL(5, 2);
    } catch (e) {
      qrImage.alt = "Referral QR code unavailable";
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2100);
  }

  function copyText(value, successMessage) {
    function fallback() {
      var input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      try {
        var copied = document.execCommand("copy");
        showToast(copied ? successMessage : "Copy is unavailable in this browser");
      } catch (e) {
        showToast("Copy is unavailable in this browser");
      }
      document.body.removeChild(input);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        showToast(successMessage);
      }).catch(fallback);
      return;
    }
    fallback();
  }

  function openReferral() {
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    document.body.classList.add("referral-open");
    document.documentElement.style.overflow = "hidden";
  }

  function closeReferral() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("referral-open");
    document.documentElement.style.overflow = "";
  }

  page.addEventListener("click", function (event) {
    var copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      var isCode = copyButton.getAttribute("data-copy") === "code";
      copyText(isCode ? codeInput.value : linkInput.value,
        isCode ? "Referral code copied" : "Referral link copied");
      return;
    }

    var navButton = event.target.closest("[data-ref-nav]");
    if (!navButton) return;
    var destination = navButton.getAttribute("data-ref-nav");
    if (destination === "referral") return;

    closeReferral();
    if (destination === "scan") {
      window.setTimeout(function () {
        if (window.mbScanQR && window.mbScanQR.open) window.mbScanQR.open();
      }, 60);
      return;
    }
    if (destination !== "home") {
      var original = document.querySelector('[data-testid="nav-' + destination + '"]');
      if (original) original.click();
    }
  });

  shareButton.addEventListener("click", function () {
    var text = "Join me with MB Cambodia. Use my referral code " + codeInput.value + ": " + linkInput.value;
    if (navigator.share) {
      navigator.share({ title: "MB Cambodia referral", text: text, url: linkInput.value })
        .catch(function () {});
      return;
    }
    copyText(linkInput.value, "Referral link copied");
  });

  document.addEventListener("click", function (event) {
    if (page.classList.contains("open")) return;
    var button = event.target.closest('[data-testid="nav-about"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openReferral();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && page.classList.contains("open")) closeReferral();
  });

  window.mbReferral = { open: openReferral, close: closeReferral };
})();
