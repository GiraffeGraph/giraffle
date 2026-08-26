const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("giraffleGoogleCalendar", {
  status() {
    return ipcRenderer.invoke("giraffle-google-calendar:status");
  },
  configure() {
    return ipcRenderer.invoke("giraffle-google-calendar:configure");
  },
  connect() {
    return ipcRenderer.invoke("giraffle-google-calendar:connect");
  },
  disconnect() {
    return ipcRenderer.invoke("giraffle-google-calendar:disconnect");
  },
  request(request) {
    if (!request || typeof request !== "object") throw new TypeError("Invalid Google Calendar request");
    return ipcRenderer.invoke("giraffle-google-calendar:request", request);
  },
});

contextBridge.exposeInMainWorld("giraffleHeadless", {
  subscribe(handler) {
    if (typeof handler !== "function") throw new TypeError("Headless request handler must be a function");
    const listener = (_event, request) => handler(request);
    ipcRenderer.on("giraffle-headless:request", listener);
    ipcRenderer.send("giraffle-headless:ready");
    return () => ipcRenderer.removeListener("giraffle-headless:request", listener);
  },
  respond(response) {
    if (!response || typeof response.id !== "string" || typeof response.ok !== "boolean") throw new TypeError("Invalid headless response");
    ipcRenderer.send("giraffle-headless:response", response);
  },
});
