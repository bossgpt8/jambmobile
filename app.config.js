// Dynamic Expo config — extends app.json and injects secrets from environment
// variables so they are never committed to source control.
//
// Environment variables used (set as GitHub Actions secrets):
//   ONESIGNAL_APP_ID  — Your OneSignal App ID
//                       (app.onesignal.com → Your App → Settings → Keys & IDs)
//   ONESIGNAL_MODE    — 'production' (default) or 'development'
//                       Controls the Apple Push Notification environment used
//                       by the onesignal-expo-plugin for iOS builds.

const base = require('./app.json');

const oneSignalAppId = process.env.ONESIGNAL_APP_ID || '';
const oneSignalMode = process.env.ONESIGNAL_MODE === 'development' ? 'development' : 'production';

if (!oneSignalAppId) {
  console.warn(
    '[app.config.js] ONESIGNAL_APP_ID environment variable is not set. ' +
    'Push notifications will not work. Set the secret in GitHub Actions (Settings → Secrets → Actions).'
  );
}

module.exports = {
  expo: {
    ...base.expo,
    plugins: [
      'expo-splash-screen',
      [
        'onesignal-expo-plugin',
        {
          mode: oneSignalMode,
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 34,
            targetSdkVersion: 34,
            minSdkVersion: 23,
            enableProguardInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
          ios: {},
        },
      ],
    ],
    extra: {
      ...base.expo.extra,
      oneSignalAppId,
    },
  },
};
