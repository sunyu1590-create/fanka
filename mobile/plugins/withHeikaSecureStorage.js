/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");

function withSecureStoragePackage(config) {
  return withMainApplication(config, (mod) => {
    let source = mod.modResults.contents;
    const importLine = "import com.heika.community.securestorage.HeikaSecureStoragePackage";
    if (!source.includes(importLine)) {
      source = source.replace(/^(package [^\n]+\n)/, `$1\n${importLine}\n`);
    }
    const registration = "add(HeikaSecureStoragePackage())";
    if (!source.includes(registration)) {
      source = source.replace(/(PackageList\(this\)\.packages\.apply\s*\{\s*\n)/, `$1          ${registration}\n`);
    }
    mod.modResults.contents = source;
    return mod;
  });
}

function withSecureStorageSource(config) {
  return withDangerousMod(config, ["android", async (mod) => {
    const projectRoot = mod.modRequest.projectRoot;
    const platformRoot = mod.modRequest.platformProjectRoot;
    const source = path.join(projectRoot, "plugins", "native", "HeikaSecureStoragePackage.kt");
    const destination = path.join(platformRoot, "app", "src", "main", "java", "com", "heika", "community", "securestorage", "HeikaSecureStoragePackage.kt");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return mod;
  }]);
}

module.exports = function withHeikaSecureStorage(config) {
  return withSecureStorageSource(withSecureStoragePackage(config));
};
