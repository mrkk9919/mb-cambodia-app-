(function () {
  "use strict";

  var options = Array.prototype.slice.call(document.querySelectorAll("[data-savings-option]"));
  var toast = document.getElementById("si-toast");
  var timer = 0;

  if (!options.length || !toast) return;

  options.forEach(function (option) {
    option.addEventListener("click", function () {
      options.forEach(function (item) {
        var selected = item === option;
        item.classList.toggle("is-selected", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });

      var title = option.querySelector(".si-title");
      toast.textContent = (title ? title.textContent : "Savings option") + " is not enabled in this demo.";
      toast.hidden = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        toast.hidden = true;
      }, 2600);
    });
  });
})();
