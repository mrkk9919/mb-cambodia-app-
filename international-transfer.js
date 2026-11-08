(function () {
  "use strict";

  var option = document.querySelector("[data-remittance-demo]");
  var toast = document.getElementById("it-toast");
  var timer = 0;

  if (!option || !toast) return;

  option.addEventListener("click", function () {
    toast.textContent = "Vietnam remittance is not enabled in this demo.";
    toast.hidden = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2600);
  });
})();
