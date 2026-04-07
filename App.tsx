import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  BackHandler,
  Platform,
  Linking,
  SafeAreaView,
  Alert,
  AppState,
} from 'react-native';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Show notifications as banners even while the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Amber warning color for the offline banner
const OFFLINE_BANNER_COLOR = '#b45309';
const APP_URL = 'https://jambgenius.app';
const BRAND_COLOR = '#1a56db';
const SPLASH_DURATION_MS = 7000;

const CONNECTIVITY_TIMEOUT_MS = 5000;
// AsyncStorage key used to persist the last successfully visited URL
const LAST_URL_KEY = 'jambgenius_last_url';

// Bundled offline fallback page shown when the user is offline and there is no
// cached version of the site available.
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JambGenius – Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#f9fafb;display:flex;align-items:center;justify-content:center;
      min-height:100vh;padding:32px;text-align:center;color:#111827}
    .icon{font-size:64px;margin-bottom:24px}
    h1{font-size:24px;font-weight:700;margin-bottom:12px}
    p{font-size:15px;color:#6b7280;line-height:1.6}
  </style>
</head>
<body>
  <div>
    <div class="icon">📶</div>
    <h1>You're Offline</h1>
    <p>No internet connection detected.<br/>Please check your network — the app will reload automatically once you're back online.</p>
  </div>
</body>
</html>`;

// Hosts allowed to open inside the WebView
// Google auth domains are included so the OAuth flow completes within the
// WebView instead of launching an external browser.
const ALLOWED_HOSTS = [
  'jambgenius.app',
  'www.jambgenius.app',
  'accounts.google.com',
  'www.google.com',
];

function isAllowedHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some(
      (host) => hostname === host || hostname.endsWith('.' + host)
    );
  } catch {
    return false;
  }
}

// Lightweight connectivity check — no native module required
async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
    await fetch(APP_URL, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const previousConnectedRef = useRef<boolean | null>(null);
  const backOnlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last URL successfully navigated to, persisted across app restarts
  const lastUrlRef = useRef(APP_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isError, setIsError] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  // Controls what the WebView displays: the live site URL or the local offline HTML
  const [webViewSource, setWebViewSource] = useState<{ uri: string } | { html: string }>(
    { uri: APP_URL }
  );

  // Request notification permission and obtain the Expo push token
  useEffect(() => {
    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      // Set up the default Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'JambGenius',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1a56db',
        });
      }

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        setPushToken(tokenData.data);
      } catch {
        // Physical device required; silently ignore in simulator/emulator
      }
    })();
  }, []);

  // When a user taps a notification, navigate to the linked URL inside the WebView.
  // The Jamb website notification-manager sends the deep link as either `url` or
  // `deepLink` depending on which code path triggered the push, so we check both.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      const url = (data.url ?? data.deepLink) as string | undefined;
      if (url && webViewRef.current) {
        if (isAllowedHost(url)) {
          webViewRef.current.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
        } else {
          Linking.openURL(url).catch(() => {});
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // Restore the last visited URL from persistent storage so the app resumes
  // where the user left off, even after a full restart.
  useEffect(() => {
    AsyncStorage.getItem(LAST_URL_KEY)
      .then((url) => {
        if (url && isAllowedHost(url)) {
          lastUrlRef.current = url;
          setWebViewSource({ uri: url });
        }
      })
      .catch(() => {});
  }, []);

  // Hide the native splash screen once the component is mounted
  useEffect(() => {
    async function prepare() {
      try {
        // Keep the splash visible for 7 seconds
        await new Promise((resolve) => setTimeout(resolve, SPLASH_DURATION_MS));
      } finally {
        setAppReady(true);
        await SplashScreen.hideAsync();
      }
    }
    prepare();
  }, []);

  // Keep track of connectivity so we can show an offline screen immediately
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const updateConnectivity = async () => {
      const connected = await checkConnectivity();
      setIsConnected(connected);
    };

    const startPolling = () => {
      pollInterval = setInterval(updateConnectivity, 10000);
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    updateConnectivity();
    startPolling();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        updateConnectivity();
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      appStateSubscription.remove();
    };
  }, []);

  // Show a small confirmation banner when connection is restored
  useEffect(() => {
    const previous = previousConnectedRef.current;

    if (previous === false && isConnected) {
      setShowBackOnline(true);
      setIsError(false);
      // Navigate to the last saved URL so the user resumes where they left off
      setWebViewSource({ uri: lastUrlRef.current });

      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
      }
      backOnlineTimerRef.current = setTimeout(() => {
        setShowBackOnline(false);
      }, 2500);
    }

    if (previous === true && !isConnected) {
      setShowBackOnline(false);
    }

    previousConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    return () => {
      if (backOnlineTimerRef.current) {
        clearTimeout(backOnlineTimerRef.current);
      }
    };
  }, []);

  // Exit app with confirmation dialog
  const handleExit = useCallback(() => {
    Alert.alert(
      'Exit App',
      'Are you sure you want to exit JambGenius?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => BackHandler.exitApp(),
        },
      ],
      { cancelable: true }
    );
  }, []);

  // Android hardware back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      handleExit();
      return true;
    };
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    return () => subscription.remove();
  }, [canGoBack, handleExit]);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      setCanGoBack(navState.canGoBack);
      // Persist the last URL the user successfully navigated to
      if (navState.url && !navState.loading && isAllowedHost(navState.url)) {
        lastUrlRef.current = navState.url;
        AsyncStorage.setItem(LAST_URL_KEY, navState.url).catch(() => {});
      }
    },
    []
  );

  // Intercept navigation: open external links in the system browser
  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string }) => {
      const { url } = request;
      if (
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('sms:')
      ) {
        Linking.openURL(url).catch(() => {});
        return false;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Handle deep links / custom schemes
        Linking.openURL(url).catch(() => {});
        return false;
      }
      if (!isAllowedHost(url)) {
        Linking.openURL(url).catch(() => {});
        return false;
      }
      return true;
    },
    []
  );

  const handleReload = useCallback(async () => {
    const connected = await checkConnectivity();
    setIsConnected(connected);
    if (!connected) {
      return;
    }
    setIsError(false);
    setWebViewSource({ uri: lastUrlRef.current });
  }, []);

  const handleGoBack = useCallback(() => {
    webViewRef.current?.goBack();
  }, []);

  // Inject the Expo push token into the page (called on load and on demand)
  const injectPushToken = useCallback((token: string) => {
    const script = `
      (function () {
        window.__expoPushToken = ${JSON.stringify(token)};
        window.dispatchEvent(new CustomEvent('expoPushToken', { detail: ${JSON.stringify(token)} }));
        true;
      })();
    `;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  // Handle WebView load errors.
  // When offline: switch to the local offline HTML page so the user sees a
  // branded fallback instead of a blank screen.  The cached site content is
  // served by the WebView's own HTTP cache, so we only reach this code path
  // when there is no cached version available.
  // When online: surface the generic error screen so the user can retry.
  const handleWebViewError = useCallback(() => {
    if (!isConnected) {
      setWebViewSource({ html: OFFLINE_HTML });
    } else {
      setIsError(true);
    }
  }, [isConnected]);

  const handleWebViewLoad = useCallback(() => {
    if (pushToken) injectPushToken(pushToken);
  }, [pushToken, injectPushToken]);

  // ---------------------------------------------------------------------------
  // Clipboard image paste bridge
  // ---------------------------------------------------------------------------

  // Injected before page content loads:
  // 1. Marks the session as running inside the JambGenius mobile app so the
  //    website's isApp() / detectApp() checks return true (enables push-token
  //    registration and hides the "download the app" popup).
  // 2. Intercepts paste events and forwards them to the React Native layer so
  //    we can read clipboard images natively.
  const PASTE_INTERCEPT_JS = `
    (function () {
      // ── App detection flags ──────────────────────────────────────────────
      try {
        localStorage.setItem('isInApp', 'true');
        window.__isJambGeniusApp = true;
      } catch (e) {}

      // ── Clipboard image paste bridge ─────────────────────────────────────
      document.addEventListener('paste', function (e) {
        // If the browser already has clipboard image data, let it through.
        var items = e.clipboardData && e.clipboardData.items;
        var hasImage = false;
        if (items) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
              hasImage = true;
              break;
            }
          }
        }
        if (!hasImage) {
          // No image in the web-side clipboard — ask the native layer.
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PASTE_REQUEST' }));
        }
      }, true);
      true;
    })();
  `;

  // Called when the WebView posts a message.
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    let msg: { type: string } | null = null;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (msg?.type === 'GET_PUSH_TOKEN') {
      if (pushToken) injectPushToken(pushToken);
      return;
    }

    if (msg?.type !== 'PASTE_REQUEST') return;

    // Try to get a PNG image from the native clipboard.
    const base64 = await Clipboard.getImageAsync({ format: 'png' })
      .then((r) => r?.data ?? null)
      .catch((err) => {
        console.warn('[PasteBridge] clipboard read failed:', err);
        return null;
      });

    if (!base64) return;

    // Inject a synthetic paste event carrying the image as a File object.
    const injectScript = `
      (function () {
        try {
          var b64 = ${JSON.stringify(base64)};
          var byteChars = atob(b64);
          var byteNums = new Array(byteChars.length);
          for (var i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
          }
          var byteArray = new Uint8Array(byteNums);
          var blob = new Blob([byteArray], { type: 'image/png' });
          var file = new File([blob], 'pasted-image.png', { type: 'image/png' });

          var dt = new DataTransfer();
          dt.items.add(file);

          var target = document.activeElement || document.body;
          var pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });
          target.dispatchEvent(pasteEvent);
        } catch (err) {
          console.warn('RN paste bridge error:', err);
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(injectScript);
  }, [pushToken]);

  if (!appReady) {
    return (
      <View style={styles.splashContainer}>
        <ExpoStatusBar style="light" backgroundColor={BRAND_COLOR} />
        <Image
          source={require('./assets/splash.png')}
          style={styles.splashImage}
          resizeMode="cover"
          fadeDuration={0}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" backgroundColor={BRAND_COLOR} />

      {/* Header */}
      <View style={styles.header}>
        {canGoBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleGoBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.headerTitle}>JambGenius</Text>
        <TouchableOpacity
          style={styles.exitButton}
          onPress={handleExit}
          accessibilityLabel="Exit app"
          accessibilityRole="button"
        >
          <Text style={styles.exitButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Offline banner – shown whenever connectivity is lost; disappears when back online */}
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            📶  No internet connection — please connect to sync changes and access full features
          </Text>
        </View>
      )}

      {/* WebView */}
      <View style={styles.webViewContainer}>
        {!isError ? (
          <WebView
            ref={webViewRef}
            source={webViewSource}
            style={styles.webView}
            // Always prefer cache so the site loads from disk when offline.
            // The WebView falls back to the network when no cache entry exists.
            cacheEnabled
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onError={handleWebViewError}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              if (nativeEvent.statusCode >= 500) {
                setIsError(true);
              }
            }}
            // Session & cookie behaviour
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            // Allow mixed content (compatibility mode matches browser defaults)
            mixedContentMode="compatibility"
            // Media permissions
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            // Microphone: auto-grant on Android; prompt on iOS when same host
            // onPermissionRequest is not yet in the react-native-webview 13.x typings
            // but is a valid Android WebView prop — use a targeted cast.
            {...({
              onPermissionRequest: (request: { resources: string[]; grant: (r: string[]) => void }) =>
                request.grant(request.resources),
            } as Record<string, unknown>)}
            mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
            // File / camera access
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            // Geo / other permissions: auto-grant so the site can request them natively
            geolocationEnabled
            // Zoom
            scalesPageToFit={Platform.OS === 'android'}
            // Use a standard mobile browser user agent so Google Sign-In / Firebase
            // does not block the request (WebView "wv" marker removed).
            // JambGeniusApp/1.0 is appended so the website's isApp() / detectApp()
            // helpers can identify requests coming from this app.
            userAgent={
              Platform.OS === 'android'
                ? 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 JambGeniusApp/1.0'
                : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1 JambGeniusApp/1.0'
            }
            // Pull-to-refresh behaviour
            bounces={false}
            overScrollMode="never"
            // Clipboard image paste bridge
            injectedJavaScriptBeforeContentLoaded={PASTE_INTERCEPT_JS}
            onLoad={handleWebViewLoad}
            onMessage={handleMessage}
          />
        ) : (
          <ErrorScreen onRetry={handleReload} />
        )}

        {showBackOnline && (
          <View style={styles.backOnlineBanner}>
            <Text style={styles.backOnlineBannerText}>Back online</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Error / Offline screen
// ---------------------------------------------------------------------------
interface ErrorScreenProps {
  onRetry: () => void;
}

function ErrorScreen({ onRetry }: ErrorScreenProps) {
  return (
    <View style={styles.errorContainer}>
      <Image
        source={require('./assets/offline.png')}
        style={styles.errorImage}
        resizeMode="cover"
      />
      <TouchableOpacity
        style={styles.retryButton}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading"
      >
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: BRAND_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    backgroundColor: BRAND_COLOR,
  },
  header: {
    height: 52,
    backgroundColor: BRAND_COLOR,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '300',
    lineHeight: 34,
    marginTop: -2,
  },
  headerSpacer: {
    width: 36,
  },
  exitButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  retryButton: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: BRAND_COLOR,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  backOnlineBanner: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  backOnlineBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  offlineBanner: {
    backgroundColor: OFFLINE_BANNER_COLOR,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
});
