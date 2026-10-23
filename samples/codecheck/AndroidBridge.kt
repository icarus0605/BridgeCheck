class AndroidBridge {
    @JavascriptInterface
    fun openCamera() { emit("cameraResult", result) }
    // getLocation is intentionally missing in this fixture.
}
