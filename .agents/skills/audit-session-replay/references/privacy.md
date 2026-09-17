> AI agents: this is one page from PostHog's docs. Full index of Markdown docs for LLMs: https://posthog.com/llms.txt

# Privacy controls - Docs

Copy page

# Privacy controls - Docs

PostHog offers a range of controls to limit what data is captured by session recordings. Our privacy controls run in the browser or mobile app. So, masked data is never sent over the network to PostHog.

## Web

## Input elements

As any input element is highly likely to contain sensitive text such as email or password, **we mask these by default**. You can explicitly set this to false to disable the masking. You can then specify inputs types you would like to be masked.

TypeScript

PostHog AI

```typescript
posthog.init('<ph_project_token>', {
    session_recording: {
        maskAllInputs: false,
        maskInputOptions: {
            password: true, // Highly recommended as a minimum!!
            // color: false,
            // date: false,
            // 'datetime-local': false,
            // email: false,
            // month: false,
            // number: false,
            // range: false,
            // search: false,
            // tel: false,
            // text: false,
            // time: false,
            // url: false,
            // week: false,
            // textarea: false,
            // select: false,
    }
})
```

### Mask or un-mask specific inputs

You can control the masking more granularly by using `maskInputFn` to customize how the masking behaves. For example, you may want to only redact text that looks like an email address, or comes from inputs that aren't search boxes.

TypeScript

PostHog AI

```typescript
posthog.init('<ph_project_token>', {
    session_recording: {
        // `maskInputFn` only applies to selected elements, so make sure to set this to true if you want this to work globally
        maskAllInputs: true,
        maskInputFn: (text, element) => {
            if (element?.attributes['type']?.value === 'search') {
                // If this is a search input, don't mask it
                return text
            }
            // Otherwise, mask it with asterisks
            return '*'.repeat(text.length)
        },
    }
})
```

## Text elements

General text is not masked by default, but we provide multiple options for masking text:

### Mask all text

> **IMPORTANT**: The `text` related config options only apply to non-input text. Inputs are masked differently and have separate methods (as detailed [above](#input-elements)).

TypeScript

PostHog AI

```typescript
posthog.init('<ph_project_token>', {
    session_recording: {
        maskTextSelector: "*" // Masks all text elements (not including inputs)
    }
})
```

### Mask or un-mask specific text

You can use a CSS selector to mask specific elements. For example, you may want to mask all elements with the class `email` or the ID `sensitive`.

TypeScript

PostHog AI

```typescript
posthog.init('<ph_project_token>', {
    session_recording: {
        maskTextSelector: ".email, #sensitive" // masks all elements with the class "email" or the ID "sensitive". This does not apply to input elements.
    }
})
```

> **IMPORTANT**: The masking of an element applies to its children meaning `:not` selectors do not work. The ability to selectively mask elements is detailed [below](#selective-privacy---only-reveal-things-that-are-marked-as-safe)

You can further control the text that gets masked. For example, by only masking text that looks like an email

TypeScript

PostHog AI

```typescript
posthog.init('<ph_project_token>', {
    session_recording: {
        // `maskTextFn` only applies to selected elements, so make sure to set to "*" if you want this to work globally.
        // This does not apply to input elements.
        maskTextSelector: "*",
        maskTextFn: (text) => {
            // this fn can receive whitespace only text, you might not want to mask that
            if (text.trim().length === 0) { return text }
            // A simple email regex - you may want to use something more advanced
            const emailRegex = /(\S+)@(\S+\.\S+)/g
            return text.replace(emailRegex, (match, g1, g2) => {
                // Replace each email with asterisks - ben@posthog.com becomes ***@***********
                return '*'.repeat(g1.length) + '@' + '*'.repeat(g2.length)
            })
        },
    }
})
```

## Other Elements

If your application displays sensitive user information outside of input or text fields, or if there are areas of your application that you simply don't want to capture, you need to update your codebase to prevent PostHog from capturing this information during session recordings.

To do so, you should add the CSS class name `ph-no-capture` to elements which should not be recorded. This will lead to the element being replaced with a block of the same size when you play back the recordings. Make sure everyone who watches recordings in your team is aware of this, so that they don't think your product is broken when something doesn't show up!

HTML

PostHog AI

```html
<div class="ph-no-capture">I won't be captured at all!</div>
```

Note that adding `ph-no-capture` will also prevent any [autocapture](/docs/data/autocapture.md) events from being captured from that element.

## URL redaction

Session replay captures the page URL shown in the replay player URL bar and timeline. Query strings can include sensitive data such as auth tokens or user identifiers. To redact them, provide a `maskCapturedNetworkRequestFn` callback, the same callback used for [network capture](/docs/session-replay/network-recording.md#how-to-register-a-callback-to-inspect-and-redact-each-network-request) also runs against the page URL captured in the snapshot, so a single configuration covers both surfaces.

Web

PostHog AI

```javascript
posthog.init('<ph_project_token>', {
    session_recording: {
        maskCapturedNetworkRequestFn: (request) => {
            if (request.name) {
                // Redact specific query params
                request.name = request.name.replace(/([?&](token|auth|email)=)[^&]+/g, '$1[REDACTED]')
                // Or strip the query string entirely:
                // request.name = request.name.split('?')[0]
            }
            return request
        },
    },
})
```

The callback runs in the browser, so redacted values never leave the user's device.

## Common example configs

### Maximum privacy - mask everything

PostHog AI

```
{
    maskAllInputs: true,
    maskTextSelector: "*"
}
```

### Limited privacy - try to mask all email / password related things

You can mask content that looks like it contains an email or password.

For passwords, it is important to note that "click to show password" buttons typically turn the input type to `text`. This would then reveal the password. Thus instead of checking for `type='password'`, you need to check a different field, like `id`:

PostHog AI

```
{
    maskAllInputs: true,
    maskInputFn: (text, element) => {
        const maskTypes = ['email', 'password']
        if (
            maskTypes.indexOf(element?.attributes['type']?.value) !== -1 ||
            maskTypes.indexOf(element?.attributes['id']?.value) !== -1
        ) {
            return '*'.repeat(text.length)
        }
        return text
    },
    maskTextSelector: '*',
    maskTextFn(text) {
        // A simple email regex - you may want to use something more advanced
        const emailRegex = /(\S+)@(\S+\.\S+)/g
        return text.trim().replace(emailRegex, (match, g1, g2) => {
            // Replace each email with asterisks - ben@posthog.com becomes ***@***********
            return '*'.repeat(g1.length) + '@' + '*'.repeat(g2.length)
        })
    }
}
```

### Selective privacy - only reveal things that are marked as safe

Instead of selectively masking, we can selectively *unmask* fields that you are sure are safe. This assumes you are adding a data attribute to every "safe" element like `<p data-record="true">I will be visible!</p>`

PostHog AI

```
{
    maskAllInputs: true,
    maskTextSelector: "*",
    maskTextFn: (text, element) => {
        if (element?.dataset['record'] === 'true') {
            return text
        }
        return '*'.repeat(text.trim().length)
    },
}
```

### Handling sensitive third-party screens

For third-party components (like payment forms or authentication screens) that can't be masked, you can manually stop and start session recordings. See [how to control which sessions you record](/docs/session-replay/how-to-control-which-sessions-you-record.md#programmatic-start-and-stop-controls) for details.

## Android

### Masking views

To mask any type of `View` in the recording, set the [tag](https://developer.android.com/reference/android/view/View#tags) or [contentDescription](https://developer.android.com/reference/android/view/View#attr_android:contentDescription) to `ph-no-capture`.

XML

PostHog AI

```xml
<ImageView
    android:id="@+id/imvProfilePhoto"
    android:layout_width="200dp"
    android:layout_height="200dp"
    android:tag="ph-no-capture"
/>
```

### Unmasking views

To explicitly prevent a `View` from being masked, even when global masking options are enabled, set the [tag](https://developer.android.com/reference/android/view/View#tags) or [contentDescription](https://developer.android.com/reference/android/view/View#attr_android:contentDescription) to `ph-no-mask`.

XML

PostHog AI

```xml
<TextView
    android:id="@+id/tvPublicLabel"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:tag="ph-no-mask"
/>
```

### Masking in Jetpack Compose

You can manually mark a composable for masking using the `postHogMask()` modifier:

Android

PostHog AI

```kotlin
Text(
    text = AnnotatedString(text),
    modifier = modifier
        .wrapContentSize()
        .postHogMask()
        .clickable { text = "Sensitive!" },
)
```

### Unmasking in Jetpack Compose

To explicitly prevent a composable from being masked, even when global masking options are enabled, use the `postHogUnmask()` modifier:

Android

PostHog AI

```kotlin
Text(
    text = "Always visible",
    modifier = modifier
        .wrapContentSize()
        .postHogUnmask(),
)
```

### Precedence and propagation

Both mask and unmask controls apply to all children of the view or composable they are set on. The unmask option (`ph-no-mask` / `postHogUnmask()`) always takes precedence over the mask option (`ph-no-capture` / `postHogMask()`). This applies to the whole subtree: a child marked `ph-no-capture` inside an unmasked view is **not** masked, and neither are views that PostHog would otherwise mask automatically. Only unmask a subtree you know contains no sensitive data.

Both `postHogMask()` and `postHogUnmask()` accept an `isEnabled` parameter. When set to `false`, the modifier has no effect (as if it was never applied), allowing dynamic control via global settings or remote config:

Android

PostHog AI

```kotlin
Text(
    text = "Conditionally masked",
    modifier = modifier
        .postHogMask(isEnabled = shouldApplyMask),
)
```

### Handling sensitive third-party screens

For third-party components (like payment forms or authentication screens) that can't be masked, you can manually stop and start session recordings. See [how to control which sessions you record](/docs/session-replay/how-to-control-which-sessions-you-record.md#programmatic-start-and-stop-controls) for details.

## iOS

### Masking views

To replace any type of `UIView` with a redacted version in the replay, set the [accessibilityIdentifier](https://developer.apple.com/documentation/uikit/uiaccessibilityidentification/1623132-accessibilityidentifier) to `ph-no-capture`:

Swift

PostHog AI

```swift
let imvProfilePhoto = UIImageView(frame: CGRect(x: 50, y: 50, width: 100, height: 100))
imvProfilePhoto.accessibilityIdentifier = "ph-no-capture"
```

> **Note:** For SwiftUI please refer to the [Masking in SwiftUI](#masking-in-swiftui) section below

### Unmasking views

To explicitly prevent a `UIView` and all its subviews from being masked, even when `maskAllTextInputs` or `maskAllImages` is enabled, set the [accessibilityIdentifier](https://developer.apple.com/documentation/uikit/uiaccessibilityidentification/1623132-accessibilityidentifier) or [accessibilityLabel](https://developer.apple.com/documentation/objectivec/nsobject-swift.class/accessibilitylabel) to `ph-no-mask`:

Swift

PostHog AI

```swift
let lblPublicTitle = UILabel(frame: CGRect(x: 50, y: 50, width: 200, height: 40))
lblPublicTitle.accessibilityIdentifier = "ph-no-mask"
```

The match is a case-insensitive substring, so `ph-no-mask` can be combined with an identifier you already use:

Swift

PostHog AI

```swift
lblPublicTitle.accessibilityIdentifier = "screen-title ph-no-mask"
```

**Requires version 3.71.0**

Support for the `ph-no-mask` identifier is added in iOS SDK version 3.71.0.

### Masking in SwiftUI

-   When using the [SwiftUI TextField](https://developer.apple.com/documentation/swiftui/textfield) with [UITextInputTraits](https://developer.apple.com/documentation/uikit/uitextinputtraits), setting traits such as `TextField("Email", text: ...).keyboardType(.emailAddress)` will always be automatically masked since it's for private text.

-   The [SwiftUI SecureField](https://developer.apple.com/documentation/swiftui/securefield) view is always automatically masked.

-   You can manually mark a SwiftUI View for masking using the `postHogMask()` view modifier:

    Swift

    PostHog AI

    ```swift
    // This view (and children) will *always* be masked in session replay recordings
    MyCoolView()
      .postHogMask()
    ```

-   The `postHogNoMask()` view modifier can be used to prevent a view from being masked in session recordings, regardless of any default masking behavior:

    Swift

    PostHog AI

    ```swift
    // This view (and children) will *never* be masked in session replay recordings
    MyCoolView()
      .postHogNoMask()
    ```

**SwiftUI and Xcode 26**

Apps built with Xcode 26 use a new SwiftUI rendering model that changes how SwiftUI views map to UIKit. This can cause `postHogMask()` and `postHogNoMask()` to behave inconsistently on primitive views like `Text`, `Image`, and `Button`.

**If you're building with Xcode 26**, update to [version 3.36.2](https://github.com/PostHog/posthog-ios/releases/tag/3.36.2) or later to ensure these modifiers work correctly.

### Precedence and propagation

`ph-no-mask` applies to the view it is set on and all of its subviews, and it takes precedence over both `ph-no-capture` and PostHog's default masking heuristics. A view marked with `ph-no-capture` that sits inside a `ph-no-mask` subtree is **not** masked, and neither are sensitive views such as text fields that PostHog would otherwise mask automatically. Only set `ph-no-mask` on a subtree you know contains no sensitive data.

### Handling sensitive third-party screens

For third-party components (like payment forms or authentication screens) that can't be masked, you can manually stop and start session recordings. See [how to control which sessions you record](/docs/session-replay/how-to-control-which-sessions-you-record.md#programmatic-start-and-stop-controls) for details.

## React Native

## Masking

By default all text, inputs, and images are masked.

Password inputs are always masked no matter your config. Auto-detection of sensitive fields relies on platform semantics — for example, `secureTextEntry` in React Native. Custom input components that don't use standard platform text fields under the hood won't be auto-detected — see [manual masking](#manual-masking) below to handle those explicitly.

You can configure masking levels when you initialise PostHog

TypeScript

PostHog AI

```typescript
export const posthog = new PostHog(
  '<ph_project_token>',
  {
    enableSessionReplay: true,
    sessionReplayConfig: {
      // Whether text and text input fields are masked. Default is true.
      // Password inputs are always masked regardless
      maskAllTextInputs: false,
      // Whether images are masked. Default is true.
      maskAllImages: true,
      // Enable masking of all sandboxed system views like UIImagePickerController, PHPickerViewController and CNContactPickerViewController. Default is true.
      // iOS only
      maskAllSandboxedViews: true,
      // rest of your config
  }
}
```

## Manual Masking

There are two ways to manually mask sensitive content in your React Native app:

## Using PostHogMaskView

Wrap any content you want to mask with the `PostHogMaskView` component:

TypeScript

PostHog AI

```typescript
import { PostHogMaskView } from 'posthog-react-native'
<PostHogMaskView>
  <Text>Sensitive content here</Text>
  <Text>All children will be masked</Text>
</PostHogMaskView>
```

This is the recommended approach as it's more explicit and doesn't interfere with accessibility features.

## Using accessibilityLabel

Alternatively, to replace any type of `React.Component` with a redacted version in the replay, set the [accessibilityLabel](https://reactnative.dev/docs/accessibility#accessibilitylabel) to `ph-no-capture`:

TypeScript

PostHog AI

```typescript
<Text accessibilityLabel="ph-no-capture">Sensitive!</Text>
```

## Unmasking

To explicitly prevent a component and all its children from being masked, even when `maskAllTextInputs` or `maskAllImages` is enabled, set the [accessibilityLabel](https://reactnative.dev/docs/accessibility#accessibilitylabel) to `ph-no-mask`:

TypeScript

PostHog AI

```typescript
<Text accessibilityLabel="ph-no-mask">Welcome to PostHog</Text>
```

The match is a case-insensitive substring, so the token can be combined with a label you already use:

TypeScript

PostHog AI

```typescript
<Text accessibilityLabel="Welcome banner ph-no-mask">Welcome to PostHog</Text>
```

## Precedence and propagation

Unmasking applies to the component and all of its children, and it takes precedence over `ph-no-capture` and over the default masking behavior. A child marked `ph-no-capture` inside an unmasked subtree is **not** masked, and neither are inputs that would otherwise be masked automatically. Only unmask a subtree you know contains no sensitive data.

**Native SDK versions**

`ph-no-mask` support is added in `posthog-ios` version 3.71.0 and `posthog-android` version 3.33.0.

## Flutter

### Masking All Texts and Images

Dart

PostHog AI

```dart
final config = PostHogConfig('<ph_project_token>');
config.sessionReplay = true;
/// Enable masking of all text and text input fields.
/// Default: true.
config.sessionReplayConfig.maskAllTexts = false;
/// Enable masking of all images.
/// Default: true.
config.sessionReplayConfig.maskAllImages = false;
```

These settings apply on iOS, Android, and — with [canvas masking](#masking-on-flutter-web) enabled — Flutter Web.

### Masking in Flutter

-   You can manually mark a Widget for masking using the `PostHogMaskWidget` Widget:

Dart

PostHog AI

```dart
...
    const PostHogMaskWidget(child: Text('Sensitive!'))
...
```

### Masking on Flutter Web

> Requires PostHog Flutter SDK version >= [5.34.0](https://github.com/PostHog/posthog-flutter/releases) and posthog-js version >= [1.408.0](https://github.com/PostHog/posthog-js/releases) in your `web/index.html`.

On Flutter web, session replay records your app as pixels inside the CanvasKit canvas, where DOM-based masking cannot see your widgets. Canvas masking applies the same rules inside the canvas: `maskAllTexts`, `maskAllImages`, `PostHogMaskWidget`, and obscured text fields (like passwords) are honored with the same semantics as iOS and Android.

To enable it, declare a mask-region provider in the `posthog.init` call in your `web/index.html`, alongside enabling canvas capture:

web/index.html

PostHog AI

```html
<script>
  posthog.init('<ph_project_token>', {
    api_host: 'https://us.i.posthog.com',
    session_recording: {
      captureCanvas: {
        recordCanvas: true,
      },
      canvasCapture: {
        // The PostHog Flutter plugin replaces this once your app starts.
        // Until then, canvas frames are skipped rather than recorded unmasked.
        maskRegionsFn: () => null,
      },
    },
  })
</script>
```

Mounting a `PostHogMaskWidget` also switches canvas masking on by itself, without the `posthog.init` declaration. Prefer the declaration when you can edit `web/index.html`: it covers the frames captured before Flutter boots (they are skipped instead of recorded unmasked), and it avoids a one-time recording restart at the moment masking switches on.

Things to know:

-   Your app must be wrapped in `PostHogWidget`. Without it, canvas frames are skipped rather than recorded unmasked, and a console warning explains the fix.
-   On a posthog-js older than 1.408.0, canvas frames are **not** masked — a console warning tells you to upgrade.
-   If your project configures a `blockSelector` in the replay project settings, list it in `posthog.init` too: the client-side value (which the plugin extends to exclude Flutter's accessibility DOM) takes precedence over the project-level one.
-   Platform views (`HtmlElementView`) are DOM elements, not canvas pixels — they follow posthog-js's DOM masking rules, and `PostHogMaskWidget` does not mask them on web.
-   Text painted by a custom `CustomPainter` is not in the widget tree, so `maskAllTexts` cannot find it — wrap it in `PostHogMaskWidget`.
-   On a page embedding multiple Flutter views, canvases belonging to other Flutter views are skipped entirely (not recorded).

### Masking platform views

Platform views (such as `WebView`, Google Maps, or other natively-rendered widgets) are composited outside the Flutter layer tree. To avoid accidentally recording sensitive content, PostHog **masks every platform view with a black box by default**.

To reveal all platform views globally, set `maskAllPlatformViews` to `false`:

Dart

PostHog AI

```dart
final config = PostHogConfig('<ph_project_token>');
config.sessionReplay = true;
/// Mask all platform views (WebView, Maps, etc.) in session replay.
/// Default: true.
config.sessionReplayConfig.maskAllPlatformViews = false;
```

For per-view control, wrap an individual platform view with the `PostHogPlatformView` widget. This overrides the global `maskAllPlatformViews` setting for that view (and every platform view nested inside it):

Dart

PostHog AI

```dart
// Reveal this view even when maskAllPlatformViews is true
PostHogPlatformView(
  privacy: PostHogPlatformViewPrivacy.capture,
  child: WebViewWidget(controller: _controller),
)
// Mask this view even when maskAllPlatformViews is false
PostHogPlatformView(
  privacy: PostHogPlatformViewPrivacy.mask,
  child: WebViewWidget(controller: _controller),
)
```

> **Platform support:** On iOS, only `WKWebView`\-backed platform views (for example `webview_flutter` in its default mode) are captured. Other platform view types (Google Maps, camera previews, and so on) are always masked, because the iOS compositor cannot safely snapshot arbitrary native views without risking leaking unmasked content.

### Capturing native screens

> Requires PostHog Flutter SDK version >= [5.32.0](https://github.com/PostHog/posthog-flutter/releases).

By default, session replay only records your Flutter UI. When a fully native screen is presented over your app (a native paywall, a presented view controller, a native activity), the replay keeps showing the covered Flutter UI until the user returns – unlike embedded platform views, the native screen is **not** replaced with a black box, and the Flutter UI behind it keeps recording.

To record those screens too, enable `captureNativeScreens`:

Dart

PostHog AI

```dart
final config = PostHogConfig('<ph_project_token>');
config.sessionReplay = true;
/// Capture full-screen native screens that cover the Flutter app.
/// Default: false.
config.sessionReplayConfig.captureNativeScreens = true;
```

While a native screen covers the app, capture is handed to the native PostHog SDK, so the screen's content appears in the replay. If a detected screen can't be captured, a single black placeholder frame is shown for it instead.

Captured native screens follow your app-wide `maskAllTexts` and `maskAllImages` settings – with the defaults (both `true`), all native text and images are masked. Setting either to `false` reveals it on native screens too, including native input fields.

You can also toggle `captureNativeScreens` at runtime for per-screen control. Turning it off takes effect immediately: setting it to `false` right before presenting a sensitive native screen guarantees that screen is not captured.

Dart

PostHog AI

```dart
config.sessionReplayConfig.captureNativeScreens = false;
presentSensitiveNativeScreen();
```

Enable it before presenting a screen you want captured – turning it on while a native screen is already up may not capture that screen.

Not everything is detected as a native screen. The following keep the previous behavior (replay keeps showing the covered Flutter UI):

-   Partial-height sheets (Apple Pay, share sheet, `.pageSheet`/`.formSheet` modals)
-   Content rendered by another process (Apple Pay, photo picker) – blank if the surrounding screen is captured
-   On Android, anything that is not a full activity in your app's process (Chrome Custom Tabs, Google Pay, dialogs, bottom sheets, permission prompts)
-   On iOS, covers without an opaque background (camera previews, image/blur backdrops)

This setting applies to whole screens presented over your app. For native views embedded inside your Flutter layout (WebViews, maps), see [masking platform views](#masking-platform-views) above.

### Handling sensitive third-party screens

For third-party components (like payment forms or authentication screens) that can't be masked, you can manually stop and start session recordings. See [how to control which sessions you record](/docs/session-replay/how-to-control-which-sessions-you-record.md#programmatic-start-and-stop-controls) for details.

## Network capture

Session replay also allows you to capture network requests and responses. Headers and bodies can include sensitive information. We scrub some headers automatically, but if your network requests and responses include sensitive information you can provide a function to scrub them. [Read more in our network capture docs](/docs/session-replay/network-recording.md#sensitive-information)

## Data deletion

On PostHog Cloud, session recordings are encrypted using per-session encryption keys. When a recording is deleted, PostHog permanently destroys the encryption key (a process called crypto-shredding), making the recording data unreadable. This is irreversible.

Deletion is a two-phase process:

1.  **Key shredding** – the encryption key is permanently destroyed, making the recording unplayable immediately
2.  **Metadata cleanup** – recording metadata is purged from the database after a 10-day grace period via a nightly scheduled job

### When recordings are deleted

Recording deletion happens automatically when:

-   **A person is deleted** via the [Persons API](/docs/api/persons.md) with the `delete_recordings` parameter set to `true`
-   **A team, project, or organization is deleted** – all recordings for each affected team are queued for deletion

### Viewing deleted recordings

If you open a recording that has been deleted, the session replay player displays a notice showing when it was deleted and by whom.

For more information on data deletion in PostHog, see [data storage](/docs/privacy/data-storage.md#data-deletion).

### Still have questions?

Ask PostHog AI

### Was this page useful?

HelpfulCould be better