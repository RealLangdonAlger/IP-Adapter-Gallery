export function showUploadWarning(message) {
  let warningWidget = document.getElementById("uploadWarningWidget");
  if (!warningWidget) {
    warningWidget = document.createElement("div");
    warningWidget.id = "uploadWarningWidget";
    document.body.appendChild(warningWidget);
  }
  warningWidget.textContent = message;
  warningWidget.style.display = "block";
  warningWidget.style.opacity = "1";
  setTimeout(() => {
    warningWidget.style.opacity = "0";
    setTimeout(() => {
      warningWidget.style.display = "none";
    }, 2000);
  }, 4000);
}
