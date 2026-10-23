export function useBridge() {
  callBridge("openCamera");
  callBridge("getLocation");
  callBridge("login", token);
  callBridge("shareContent", url);
  callBridge("closeWebView");
  window.addEventListener("cameraResult", onCamera);
  window.addEventListener("locationResult", onLocation);
  window.addEventListener("loginResult", onLogin);
  window.addEventListener("shareResult", onShare);
}
