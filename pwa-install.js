(function () {
  "use strict";

  var deferredPrompt = null;
  var isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  var isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./service-worker.js").catch(function () {});
    });
  }

  if (isStandalone) return;

  var banner = document.createElement("aside");
  banner.className = "pwa-install";
  banner.setAttribute("aria-label", "Install MB Cambodia");
  banner.hidden = true;

  var copy = document.createElement("div");
  copy.className = "pwa-install-copy";
  var title = document.createElement("strong");
  title.textContent = "MB Cambodia";
  var description = document.createElement("span");
  description.textContent = "Install the app for quick access.";
  copy.appendChild(title);
  copy.appendChild(description);

  var installButton = document.createElement("button");
  installButton.className = "pwa-install-action";
  installButton.type = "button";
  installButton.textContent = isAppleMobile ? "How to add" : "Install";

  var closeButton = document.createElement("button");
  closeButton.className = "pwa-install-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Dismiss install prompt");
  closeButton.textContent = "\u00d7";

  banner.appendChild(copy);
  banner.appendChild(installButton);
  banner.appendChild(closeButton);
  document.body.appendChild(banner);

  function showBanner() {
    banner.hidden = false;
  }

  function hideBanner() {
    banner.hidden = true;
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    installButton.textContent = "Install";
    description.textContent = "Install the app for quick access.";
    showBanner();
  });

  installButton.addEventListener("click", function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === "accepted") hideBanner();
        deferredPrompt = null;
      });
      return;
    }
    if (isAppleMobile) {
      description.textContent = "In Safari, tap Share, then Add to Home Screen.";
      installButton.textContent = "Got it";
      installButton.addEventListener("click", hideBanner, { once: true });
    }
  });

  closeButton.addEventListener("click", hideBanner);
  window.addEventListener("appinstalled", hideBanner);

  if (isAppleMobile) showBanner();
})();
