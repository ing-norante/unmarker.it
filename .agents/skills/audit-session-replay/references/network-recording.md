> AI agents: this is one page from PostHog's docs. Full index of Markdown docs for LLMs: https://posthog.com/llms.txt

# Network performance recording - Docs

Copy page

# Network performance recording - Docs

Session replay allows you to capture network requests and responses, providing insights into network performance and potential issues. This feature can be particularly useful for debugging and optimizing your application's network interactions.

## Web

PostHog can capture network requests that occur during the browser session, so you can see if your application is sending the expected requests and response, and check the effect of slow network requests or errors on the user experience.

You can enable network recording from your [project settings](https://app.posthog.com/project/settings):

![Enable network recording in your PostHog](https://res.cloudinary.com/dmukukwp6/image/upload/posthog.com/contents/images/docs/session-replay/enable-session-replay-in-project-settings-light-mode.png)![Enable network recording in your PostHog](https://res.cloudinary.com/dmukukwp6/image/upload/posthog.com/contents/images/docs/session-replay/enable-session-replay-in-project-settings-dark-mode.png)

When enabled PostHog always captures:

-   the network request URL,
-   [performance information](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry) about the request,

When request capture is enabled you can also enabled payload and body capture, this includes:

-   the request method
-   the response code
-   request & response headers (if enabled)
-   request & response body (if enabled)

Request and response body and header capture are off by default. You can enable them through your project settings or SDK configuration.

## Sensitive information

We automatically scrub some sensitive information from network headers and payloads, but if your request or response payloads could contain sensitive data, you should provide a function to mask the captured data when you initialize PostHog.

We have a deny-list of headers that we will never capture (even if you provide a masking function).

-   authorization
-   x-forwarded-for
-   cookie
-   set-cookie
-   x-api-key
-   x-real-ip
-   remote-addr
-   forwarded
-   proxy-authorization
-   x-csrf-token
-   x-csrftoken
-   x-xsrf-token

And we redact bodies if we believe they contain

-   credit card numbers
-   social security numbers
-   password
-   secret
-   passwd
-   api\_key
-   apikey
-   auth
-   credentials
-   mysql\_pwd
-   privatekey
-   private\_key
-   token

> **Note:** If you provide a masking function to alter redaction of payloads it entirely replaces PostHog's automatic payload redaction.

## How to register a callback to inspect and redact each network request

> **Note:** This callback also runs against the page URL captured in the session snapshot (the URL shown in the replay player), not only network request URLs. See [URL redaction](/docs/session-replay/privacy.md#url-redaction) in the privacy docs.

Web

PostHog AI

```javascript
posthog.init('<ph_project_token>', {
    session_recording: {
        maskCapturedNetworkRequestFn: (request: CapturedNetworkRequest) => {
            // For example: ignoring a request entirely
            if (request.name.includes('example.com')) {
                return null
            }
            // ... or remove the query string from the URL
            request.name = request.name.split('?')[0]
            // ...redact the request or response body **however makes sense for your payloads**
            request.requestBody = request.requestBody?.replace(/"password":\s*"[^"]*"/g, '"password": "redacted-password"')
            request.responseBody = request.responseBody?.replace(/"password":\s*"[^"]*"/g, '"password": "redacted-password"')
            // ... or remove the request body
            request.requestBody = undefined
            // ... and more
            // finally return the request
            return request
        }
    }
})
```

### Filter captured output by URL

To keep only requests to an exact URL, use an allowlist:

Web

PostHog AI

```javascript
posthog.init("<ph_project_token>", {
    session_recording: {
        maskCapturedNetworkRequestFn: (request) =>
            request.name === "https://api.example.com/public/status" ? request : null,
    },
})
```

Replace the example URL with one whose captured content you intend to keep. Exact matching excludes other hosts, paths, and query strings. This callback doesn't enable body or header capture. It returns allowed content unchanged, so redact sensitive payloads yourself, as described above.

The callback filters output after collection. Returning `null` or `undefined` drops an ordinary request, but enabled body and header capture may already have read its data. Removing fields in the callback also doesn't undo those reads. This is not a URL allowlist that prevents collection.

Initial navigation and performance entries (`isInitial === true`) are an exception. Replay keeps required timing metadata when you drop an initial entry, but removes its URL, headers, and body. The callback also affects replay page URLs, so check the [URL redaction guidance](/docs/session-replay/privacy.md#url-redaction) before applying an allowlist.

## Prevent body and header access

To prevent the replay network plugin from reading request and response bodies and headers, set both options to `false` at initialization:

Web

PostHog AI

```javascript
posthog.init("<ph_project_token>", {
    session_recording: {
        recordBody: false,
        recordHeaders: false,
    },
})
```

Both options are booleans. An explicit local `false` overrides remote enablement for that option. With both disabled, the replay network plugin doesn't install its `fetch` and XHR detail-capture wrappers. This applies to every URL, not a selection of URLs.

Disabling only `recordBody` doesn't prevent all access: header capture can still inspect headers and request-body properties. Disabling only `recordHeaders` doesn't prevent header inspection needed for body capture.

These options don't disable network timing or URL recording, DOM snapshots, other SDK collection, or all transmission to PostHog. Configure [replay privacy controls](/docs/session-replay/privacy.md) and consent separately.

## Troubleshooting

### Recording from localhost

Due to the very high volume of network requests that some tools can make (for example when running hot-reload during development) PostHog does not capture network requests when running on localhost

### Requests early in the page lifecycle don't capture all information

PostHog has to wrap `fetch` and `xhr` in order to capture network requests. If your application makes network requests before PostHog has had a chance to wrap them, then PostHog will not capture all information about the request.

### PostHog truncated the request or response body

In order to maintain service levels we truncate all request and response bodies at 1MB

### A network request says it was redacted

We are cautious in what we capture. If you think we're being too cautious you can override the masking function.

### I want to query the network performance data I capture

We'd love that too! It's not possible right now but watch this space. You can [subscribe for updates in GitHub](https://github.com/PostHog/posthog/issues/19686)

## Android

To capture network requests in your recordings, add `PostHogOkHttpInterceptor` to your `OkHttp Interceptor`.

Android

PostHog AI

```kotlin
import com.posthog.PostHogOkHttpInterceptor
import okhttp3.OkHttpClient
private val client = OkHttpClient.Builder()
    // Support for remote configuration
    // in the [session replay settings](https://app.posthog.com/settings/project-replay#replay-network)
    // requires SDK version 3.32.0 or higher.
    .addInterceptor(PostHogOkHttpInterceptor(captureNetworkTelemetry = true))
    .build()
```

> **Note:** Only metric-like data like speed, size, and response code are captured. No data is captured from the request or response body.

## Add tracing headers

The same interceptor can also add PostHog tracing headers to matching hosts. See the [Android tracing headers docs](/docs/libraries/android.md#tracing-headers) for setup.

## iOS

In iOS, PostHog uses method swizzling on [URLSession](https://developer.apple.com/documentation/foundation/urlsession) methods, which allows for the out-of-the-box collection of network data.

However, URLSession's async/await-powered APIs are not exposed to the `objc` runtime and cannot be swizzled. As a result, network telemetry cannot be automatically captured.

For apps using async `URLSession` methods, PostHog provides wrapper functions that you can use to manually capture network logs.

Swift

PostHog AI

```swift
import PostHog
func fetchData(from url: URL) async throws -> Data {
    // let (data, _) = try await URLSession.shared.data(from: url)      // ⬅ replace this
    let (data, _) = try await URLSession.shared.postHogData(from: url)  // 🦔 with this
    // your logic here...
    return data
}
```

You can find a list of available methods to use manually in the [URLSession extension source](https://github.com/PostHog/posthog-ios/blob/main/PostHog/Replay/Plugins/Network/URLSessionExtension.swift).

> **Note:** Only metric-like data like speed, size, and response code are captured. No data is captured from the request or response body.

## React Native

To capture network requests in your recordings, add `captureNetworkTelemetry: true` to your PostHog Session replay configuration alongside any of your other configuration options:

> **Note:** Capture network requests is only available for iOS.

TypeScript

PostHog AI

```typescript
export const posthog = new PostHog(
  '<ph_project_token>',
  {
    // Enable session recording. Requires enabling in your project settings as well.
    // Default is false.
    enableSessionReplay: true,
    sessionReplayConfig: {
      // Whether network requests are captured in recordings. Default is true
      // Only metric-like data like speed, size, and response code are captured.
      // No data is captured from the request or response body.
      // iOS only
      // Remote configuration via project settings requires SDK version 4.35.0 or higher.
      captureNetworkTelemetry: true,
      ...
    },
  },
);
```

> **Note:** Only metric-like data like speed, size, and response code are captured. No data is captured from the request or response body.

## Performance considerations

Capturing network performance data can have an impact on your application's performance. Be mindful of the amount of data you're capturing and consider implementing sampling or other optimization techniques if you're dealing with high-volume network traffic.

### Still have questions?

Ask PostHog AI

### Was this page useful?

HelpfulCould be better