class AndroidBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun openCamera() { activity.launchCamera { result -> emit("cameraResult", result) } }

    @JavascriptInterface
    fun login(token: String) { activity.signIn(token) { emit("loginResult", it) } }

    @JavascriptInterface
    fun shareContent(url: String) { activity.share(url) { emit("share_result", it) } }

    @JavascriptInterface
    fun closeWebView() { activity.finish() }
    // getLocation 처리가 빠져 있습니다(발표용 의도적 누락).
}
