document.addEventListener("DOMContentLoaded", () => {
  const darkmodeEnable = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("darkMode", darkmodeEnable);

  const switchMode = document.getElementById("switchMode");
  if (switchMode) {
    switchMode.checked = darkmodeEnable;

    switchMode.addEventListener("change", () => {
      const isDark = switchMode.checked;
      document.body.classList.toggle("darkMode", isDark);
      localStorage.setItem("darkMode", isDark);
    });
  }
});
