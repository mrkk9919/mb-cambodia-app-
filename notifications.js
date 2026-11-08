(function () {
  "use strict";

  var page = document.getElementById("notification-page");
  if (!page) return;

  var generalPanel = document.getElementById("notice-general");
  var transactionPanel = document.getElementById("notice-transaction");
  var generalTab = document.getElementById("notice-tab-general");
  var transactionTab = document.getElementById("notice-tab-transaction");

  function setTab(name) {
    var general = name === "general";
    generalTab.classList.toggle("selected", general);
    transactionTab.classList.toggle("selected", !general);
    generalTab.setAttribute("aria-selected", general ? "true" : "false");
    transactionTab.setAttribute("aria-selected", general ? "false" : "true");
    generalPanel.hidden = !general;
    transactionPanel.hidden = general;
  }

  function openNotifications() {
    if (window.mbReferral && window.mbReferral.close) window.mbReferral.close();
    page.classList.add("open");
    page.setAttribute("aria-hidden", "false");
    document.body.classList.add("notification-open");
    document.documentElement.style.overflow = "hidden";
    setTab("general");
  }

  function closeNotifications() {
    page.classList.remove("open");
    page.setAttribute("aria-hidden", "true");
    document.body.classList.remove("notification-open");
    document.documentElement.style.overflow = "";
  }

  page.addEventListener("click", function (event) {
    var tab = event.target.closest("[data-notice-tab]");
    if (tab) {
      setTab(tab.getAttribute("data-notice-tab"));
      return;
    }

    if (event.target.closest("[data-notification-close]")) {
      closeNotifications();
      return;
    }

    var nav = event.target.closest("[data-notification-nav]");
    if (!nav) return;
    var destination = nav.getAttribute("data-notification-nav");
    if (destination === "home") {
      closeNotifications();
      return;
    }
    closeNotifications();
    if (destination === "scan") {
      window.setTimeout(function () {
        if (window.mbScanQR && window.mbScanQR.open) window.mbScanQR.open();
      }, 60);
    } else if (destination === "referral") {
      if (window.mbReferral && window.mbReferral.open) window.mbReferral.open();
    } else {
      var original = document.querySelector('[data-testid="nav-' + destination + '"]');
      if (original) original.click();
    }
  });

  document.addEventListener("click", function (event) {
    if (page.classList.contains("open")) return;
    var button = event.target.closest('[data-testid="nav-notifications"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openNotifications();
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && page.classList.contains("open")) closeNotifications();
  });

  window.mbNotifications = { open: openNotifications, close: closeNotifications };
})();
