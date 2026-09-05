import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { WebView } from 'react-native-webview'
import Constants from 'expo-constants'

const DEFAULT_URL =
  process.env.EXPO_PUBLIC_WEB_URL ||
  Constants.expoConfig?.extra?.webUrl ||
  'http://localhost:5173'

function resolveUrl(raw) {
  if (Platform.OS === 'android' && raw.includes('localhost')) {
    return raw.replace('localhost', '10.0.2.2')
  }
  return raw
}

export default function App() {
  const [draft, setDraft] = useState(DEFAULT_URL)
  const [sourceUrl, setSourceUrl] = useState(resolveUrl(DEFAULT_URL))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showBar, setShowBar] = useState(false)

  const source = useMemo(() => ({ uri: sourceUrl }), [sourceUrl])

  const applyUrl = () => {
    const next = draft.trim()
    if (!next) return
    setError(null)
    setLoading(true)
    setSourceUrl(resolveUrl(next))
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <View style={styles.header}>
        <Pressable onLongPress={() => setShowBar((v) => !v)} style={styles.brand}>
          <View style={styles.mark}>
            <Text style={styles.markText}>M</Text>
          </View>
          <View>
            <Text style={styles.title}>Magnet</Text>
            <Text style={styles.sub}>WebView · Backend API</Text>
          </View>
        </Pressable>
        <Text style={styles.hint}>{loading ? 'Loading' : 'Live'}</Text>
      </View>

      {showBar && (
        <View style={styles.bar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Web UI URL"
            placeholderTextColor="#5c6678"
            style={styles.input}
            onSubmitEditing={applyUrl}
          />
          <Pressable style={styles.go} onPress={applyUrl}>
            <Text style={styles.goText}>Load</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.webWrap}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>WebView failed</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Text style={styles.errorMeta}>{sourceUrl}</Text>
            <Pressable
              style={styles.retry}
              onPress={() => {
                setError(null)
                setLoading(true)
                setSourceUrl((u) => u)
              }}
            >
              <Text style={styles.goText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <WebView
            source={source}
            onLoadStart={() => {
              setLoading(true)
              setError(null)
            }}
            onLoadEnd={() => setLoading(false)}
            onError={(e) => {
              setLoading(false)
              setError(e.nativeEvent?.description || 'Failed to load UI')
            }}
            onHttpError={(e) => {
              if (e.nativeEvent.statusCode >= 400) {
                setError(`HTTP ${e.nativeEvent.statusCode}`)
              }
            }}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo
            mixedContentMode="always"
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            style={styles.webview}
          />
        )}
        {loading && !error && (
          <View style={styles.loader}>
            <ActivityIndicator color="#d4a056" />
            <Text style={styles.loaderText}>Connecting to Magnet UI</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#090b0e',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#262d3a'
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#12151c',
    borderWidth: 1,
    borderColor: '#262d3a',
    alignItems: 'center',
    justifyContent: 'center'
  },
  markText: { color: '#d4a056', fontWeight: '800' },
  title: { color: '#eef1f6', fontSize: 16, fontWeight: '800' },
  sub: { color: '#8b95a8', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  hint: { color: '#8b95a8', fontSize: 11 },
  bar: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#262d3a'
  },
  input: {
    flex: 1,
    backgroundColor: '#12151c',
    color: '#eef1f6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13
  },
  go: {
    backgroundColor: '#d4a056',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center'
  },
  goText: { color: '#1a1206', fontWeight: '700', fontSize: 13 },
  webWrap: { flex: 1, backgroundColor: '#090b0e' },
  webview: { flex: 1, backgroundColor: '#090b0e' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,11,14,0.72)',
    gap: 10
  },
  loaderText: { color: '#8b95a8', fontSize: 13 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { color: '#eef1f6', fontSize: 18, fontWeight: '700' },
  errorBody: { color: '#ef6b6b', textAlign: 'center' },
  errorMeta: { color: '#5c6678', fontSize: 12, marginTop: 4 },
  retry: { marginTop: 12, backgroundColor: '#d4a056', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }
})
