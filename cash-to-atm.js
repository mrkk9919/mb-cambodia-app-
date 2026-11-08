(function () {
  "use strict";

  var accountWrap = document.querySelector(".atm-account-select-wrap");
  var trigger = document.getElementById("atm-account-trigger");
  var menu = document.getElementById("atm-account-menu");
  var owner = document.querySelector(".atm-account-owner");
  var number = document.querySelector(".atm-account-number");
  var toast = document.getElementById("atm-toast");
  var withdrawalButton = document.querySelector('[data-atm-action="withdrawal"]');
  var toastTimer = 0;

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  }

  function closeMenu(returnFocus) {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  }

  trigger.addEventListener("click", function () {
    var isOpen = trigger.getAttribute("aria-expanded") === "true";
    trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
    menu.hidden = isOpen;
    if (!isOpen) menu.querySelector('[role="option"]').focus();
  });

  menu.addEventListener("click", function (event) {
    var option = event.target.closest('[role="option"]');
    if (!option) return;

    menu.querySelectorAll('[role="option"]').forEach(function (item) {
      item.setAttribute("aria-selected", item === option ? "true" : "false");
    });
    owner.textContent = "THOEURN SAROEUN";
    number.textContent = option.dataset.account + " | " + option.dataset.currency;
    closeMenu(true);
    showToast("Showing withdrawal history for " + option.dataset.currency + " account.");
  });

  document.addEventListener("click", function (event) {
    if (!accountWrap.contains(event.target)) closeMenu(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !menu.hidden) closeMenu(true);
  });

  withdrawalButton.addEventListener("click", function () {
    showToast("ATM withdrawal code generation is not enabled in this demo.");
  });
})();
