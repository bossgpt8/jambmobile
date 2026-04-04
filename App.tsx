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
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const APP_URL = 'https://jambgenius.app';
const BRAND_COLOR = '#1a56db';
const SPLASH_DURATION_MS = 7000;

// Hosts allowed to open inside the WebView
const ALLOWED_HOSTS = ['jambgenius.app', 'www.jambgenius.app'];

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

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const previousConnectedRef = useRef<boolean | null>(null);
  const backOnlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isError, setIsError] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showBackOnline, setShowBackOnline] = useState(false);

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
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });

    NetInfo.fetch().then((state) => {
      setIsConnected(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });

    return unsubscribe;
  }, []);

  // Show a small confirmation banner when connection is restored
  useEffect(() => {
    const previous = previousConnectedRef.current;

    if (previous === false && isConnected) {
      setShowBackOnline(true);
      setIsError(false);
      webViewRef.current?.reload();

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
    const state = await NetInfo.fetch();
    const connected =
      Boolean(state.isConnected) && state.isInternetReachable !== false;
    setIsConnected(connected);
    if (!connected) {
      return;
    }
    setIsError(false);
    webViewRef.current?.reload();
  }, []);

  const handleGoBack = useCallback(() => {
    webViewRef.current?.goBack();
  }, []);

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

  const shouldShowOffline = !isConnected;

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

      {/* WebView */}
      <View style={styles.webViewContainer}>
        {!isError && !shouldShowOffline ? (
          <WebView
            ref={webViewRef}
            source={{ uri: APP_URL }}
            style={styles.webView}
            cacheEnabled
            cacheMode={isConnected ? 'LOAD_DEFAULT' : 'LOAD_CACHE_ELSE_NETWORK'}
            onNavigationStateChange={handleNavigationStateChange}
            onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
            onError={() => {
              setIsError(true);
            }}
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
            // File / camera access
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            // Geo / other permissions: auto-grant so the site can request them natively
            geolocationEnabled
            // Zoom
            scalesPageToFit={Platform.OS === 'android'}
            // Use a standard mobile browser user agent so Google Sign-In / Firebase
            // does not block the request (WebView "wv" marker removed)
            userAgent={
              Platform.OS === 'android'
                ? 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
                : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
            }
            // Pull-to-refresh behaviour
            bounces={false}
            overScrollMode="never"
          />
        ) : (
          <ErrorScreen onRetry={handleReload} isOffline={shouldShowOffline} />
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
  isOffline: boolean;
}

function ErrorScreen({ onRetry, isOffline }: ErrorScreenProps) {
  return (
    <View style={styles.errorContainer}>
      <Image
        source={require('./assets/offline.png')}
        style={styles.errorImage}
        resizeMode="contain"
      />
      <Text style={styles.errorTitle}>{isOffline ? 'No Connection' : 'Something went wrong'}</Text>
      <Text style={styles.errorMessage}>
        {isOffline
          ? "You are offline or your connection dropped. Please check your internet and try again."
          : "We couldn't load JambGenius right now. Please try again."}
      </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f9fafb',
  },
  errorImage: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  retryButton: {
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
});
