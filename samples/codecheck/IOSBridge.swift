func handle(action: String) {
    switch action {
    case "openCamera": sendEvent("cameraResult", result)
    default: break
    }
}
