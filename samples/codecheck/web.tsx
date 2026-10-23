callBridge("openCamera");
callBridge("getLocation");
window.addEventListener("cameraResult", onCamera);
window.addEventListener("locationResult", onLocation);
