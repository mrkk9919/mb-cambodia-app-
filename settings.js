(function () {
  "use strict";

  var page = document.getElementById("settings-page");
  if (!page) return;

  var toast = document.getElementById("settings-toast");
  var toastTimer = 0;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2100);
  }

  function openSettings() {
    if (window.mbReferral && window.mbReferral.close) window.mbReferral.close();
    if (window.mbNotifications && window.mbNotifications.close) window.mbNotifications.close();
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    document.body.classList.add("settings-open");
    document.documentElement.style.overflow = "hidden";
  }

  function closeSettings() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("settings-open");
    document.documentElement.style.overflow = "";
  }

  page.addEventListener("click", function (event) {
    var toggle = event.target.closest(".settings-toggle");
    if (toggle) {
      var enabled = toggle.classList.toggle("on");
      toggle.setAttribute("aria-checked", enabled ? "true" : "false");
      return;
    }

    var action = event.target.closest("[data-settings-action]");
    if (action) {
      showToast(action.getAttribute("data-settings-action") + " is a demo setting");
      return;
    }

    if (event.target.closest("#settings-verify")) {
      showToast("Online verification is a demo feature");
      return;
    }

    var nav = event.target.closest("[data-settings-nav]");
    if (!nav) return;
    var destination = nav.getAttribute("data-settings-nav");
    if (destination === "home") {
      closeSettings();
      return;
    }
    closeSettings();
    if (destination === "scan") {
      window.setTimeout(function () {
        if (window.mbScanQR && window.mbScanQR.open) window.mbScanQR.open();
      }, 60);
    } else if (destination === "referral") {
      if (window.mbReferral && window.mbReferral.open) window.mbReferral.open();
    } else if (destination === "notifications") {
      if (window.mbNotifications && window.mbNotifications.open) window.mbNotifications.open();
    }
  });

  document.addEventListener("click", function (event) {
    if (page.classList.contains("open")) return;
    var button = event.target.closest('[data-testid="nav-settings"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openSettings();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && page.classList.contains("open")) closeSettings();
  });

  window.mbSettings = { open: openSettings, close: closeSettings };
})();
