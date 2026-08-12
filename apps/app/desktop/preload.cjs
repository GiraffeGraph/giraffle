const { contextBridge, ipcRenderer } = require("electron");

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
