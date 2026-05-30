const fs = require('fs');
const path = require('path');

// Load the static app.json so we preserve existing configuration and only
// programmatically inject environment-specific values (like the OneSignal
// App ID) at build time.
const appJsonPath = path.resolve(__dirname, 'app.json');
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const ONE_SIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || null;

if (ONE_SIGNAL_APP_ID) {
  // Ensure extra exists
  appJson.expo.extra = appJson.expo.extra || {};
  appJson.expo.extra.oneSignalAppId = ONE_SIGNAL_APP_ID;

  // Inject the OneSignal Expo plugin with the app id so native manifests
  // are configured during prebuild / EAS build.
  appJson.expo.plugins = appJson.expo.plugins || [];
  // Avoid duplicating the plugin entry if present
  const hasOneSignalPlugin = appJson.expo.plugins.some((p) => {
    if (typeof p === 'string') return p === 'onesignal-expo-plugin';
    if (Array.isArray(p)) return p[0] === 'onesignal-expo-plugin';
    return false;
  });
  if (!hasOneSignalPlugin) {
    appJson.expo.plugins.push([
      'onesignal-expo-plugin',
      { onesignal_app_id: ONE_SIGNAL_APP_ID }
    ]);
  }
}

module.exports = appJson;
