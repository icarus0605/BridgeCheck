func handle(action: String, payload: [String: Any]) {
    switch action {
    case "openCamera": camera.open { sendEvent("cameraResult", $0) }
    case "getLocation": location.request { sendEvent("locationResult", $0) }
    case "shareContent": share.present { sendEvent("shareResult", $0) }
    case "closeWebView": dismiss()
    case "openSettings": settings.open()
    default: break
    }
    // login 처리가 빠져 있습니다(발표용 의도적 누락).
}
