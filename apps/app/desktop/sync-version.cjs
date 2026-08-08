const fs = require("node:fs");
const path = require("node:path");

const appPackagePath = path.resolve(__dirname, "..", "package.json");
const desktopPackagePath = path.resolve(__dirname, "package.json");
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, "utf8"));
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));

if (desktopPackage.version !== appPackage.version) {
  desktopPackage.version = appPackage.version;
  fs.writeFileSync(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);
}
