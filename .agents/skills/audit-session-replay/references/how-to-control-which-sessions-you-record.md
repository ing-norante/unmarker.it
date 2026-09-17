> AI agents: this is one page from PostHog's docs. Full index of Markdown docs for LLMs: https://posthog.com/llms.txt

# How to control which sessions you record - Docs

Copy page

# How to control which sessions you record - Docs

**This page assumes current SDK defaults**

This page is written with the assumed `defaults: '2026-06-25'` when initializing the PostHog SDK. Earlier `defaults` values change some of the behavior described below.

When setting up recording rules, there are three questions to ask yourself:

-   Which sessions are worth starting a recording for
-   How many of those matching sessions you actually need
-   How short is too short to be worth keeping

In most cases, you can initialize the PostHog SDK with the default settings and use the trigger group conditions above to control what gets recorded. If you need more control, you can use [manual start/stop controls](#programmatic-start-and-stop-controls).

## Trigger groups

A trigger group is one rule for starting a recording. Each group carries its own conditions — URL triggers, event triggers, and a feature flag — plus its own sample rate, minimum duration, and match type (ANY/ALL).

![A trigger group's settings: group name, sample rate, minimum duration, match type, and its conditions](https://res.cloudinary.com/dmukukwp6/image/upload/w_1600,c_limit,q_auto,f_auto/trigger_group_light_062209f6b0.png)![A trigger group's settings: group name, sample rate, minimum duration, match type, and its conditions](https://res.cloudinary.com/dmukukwp6/image/upload/w_1600,c_limit,q_auto,f_auto/trigger_group_dark_80e077d3d8.png)

Multiple trigger groups can be active at the same time. A session is recorded if it matches **any** of your trigger groups. Within a group, conditions are combined based on that group's match type.

Trigger groups are configured on the [replay ingestion settings page](https://app.posthog.com/replay/settings#selectedSetting=replay-triggers), and are supported on posthog-js 1.369.0+. Earlier versions, and projects with no trigger groups configured, fall back to the [legacy controls](#legacy-controls) below. You should aim to upgrade to the latest version of `posthog-js` to use trigger groups as soon as possible.

**Admin permissions required**

Creating, editing, and deleting trigger groups requires project admin permissions. Non-admin project members can view trigger group configurations but cannot modify them.

For example, you could create:

-   A group that records all sessions on your checkout page at 100% sample rate
-   A group that records 10% of all sessions across your entire site
-   A group that records any session where an exception event occurs

To create a trigger group, go to the [replay ingestion settings page](https://app.posthog.com/replay/settings#selectedSetting=replay-triggers) and click **Add** in the **Trigger groups** section.

If you delete your last trigger group, PostHog automatically replaces it with a default "Record all sessions" group at 100% sampling with no conditions. This keeps your project on trigger groups rather than reverting to legacy recording settings.

**No conditions means every session matches**

A trigger group with no conditions matches every session, so its sample rate becomes the recording rate for your whole project.

### Controls available

| Control | What it does |
| --- | --- |
| [Sampling](#sampling) | Records a percentage of the sessions that matched this group. |
| [URL triggers](#url-triggers) | Starts recording when the user visits a matching URL. |
| [Event triggers](#event-triggers) | Starts recording when a matching event is captured. |
| [Feature flag triggers](#feature-flag-triggers) | Records only the users who have the flag enabled. |
| [Minimum duration](#minimum-duration) | Discards sessions shorter than the threshold you set. |
| [Combining controls](#combining-controls) | Decides whether a group needs any of its conditions, or all of them. |

### Sampling

Sampling enables you to record a percentage of sessions. Each trigger group has its own sample rate, applied to the sessions that matched that group's conditions.

Sampling is supported on the following SDKs:

| Platform | Minimum version |
| --- | --- |
| [Web](/docs/libraries/js.md) | posthog-js 1.85.0+ |
| [Android](/docs/libraries/android.md) | 3.34.0+ |
| [iOS](/docs/libraries/ios.md) | 3.42.0+ |
| [React Native](/docs/libraries/react-native.md) | 4.37.0+ |
| [Flutter](/docs/libraries/flutter.md) | 5.26.0+ |

Our recommendation is to start with capturing 100% of sessions and decrease it as needed. This helps you get a sense of how many sessions you’re recording and how much data you’re collecting.

#### How sampling works

Sampling is deterministic based on the session ID. When a new session starts, PostHog converts the session ID into a number between 0 and 1 using a hash function. This number is then compared to your configured sample rate (for example, 0.1 for 10% or 0.2 for 20%).

If the generated number is less than the sample rate, the session is recorded. Because the same session ID always produces the same number, the decision to record or not is consistent throughout the session's lifetime.

This means:

-   Sessions are selected based on their ID, not by time period or order
-   The same session will always get the same recording decision, even across page refreshes
-   At 20% sampling, roughly 20% of your unique sessions will be recorded, distributed evenly across your traffic

**You can't choose which sessions are sampled**

Sampling reduces the number of sessions you record, but you cannot control which specific sessions are selected — the selection is determined by the session ID hash.

### URL triggers

You can opt to only start recordings once your user visits a certain page. After the URL matches, the recording continues even after they leave the matching page. The client keeps a buffer in-memory (see [how the buffer works](#how-the-trigger-buffer-works) below), so you'll still be able to see how they arrived at the page.

URL trigger patterns are regular expressions and are automatically anchored: PostHog wraps your pattern in `^` and `$`, so it must match the full URL including the path. A bare domain like `https://example.com` won't match `https://example.com/` or any subpage.

To record on a domain, all of its subdomains, and every path:

PostHog AI

```
https://([a-zA-Z0-9-]+\.)?example\.com(/.*)?
```

Use the URL tester in the settings panel to check your pattern against real URLs before saving.

### Event triggers

You can opt to only start recordings once your user emits a particular event. After the event is captured, the recording continues for the rest of the session. On the web, the client keeps a buffer in-memory (see [how the buffer works](#how-the-trigger-buffer-works) below), so you'll still be able to see activity leading up to that event.

**Event triggers match on the event name only**

Property filters are not applied, so an event trigger can't be scoped to a specific domain or page. Use a URL trigger for that.

Event triggers are supported on the following SDKs:

| Platform | Minimum version |
| --- | --- |
| [Web](/docs/libraries/js.md) | posthog-js 1.186.0+ |
| [iOS](/docs/libraries/ios.md) | 3.48.0+ |
| [Android](/docs/libraries/android.md) | 3.40.1+ |
| [React Native](/docs/libraries/react-native.md) | 4.52.0+ |
| [Flutter](/docs/libraries/flutter.md) | 5.25.0+ |

**Mobile platforms have no pre-buffer**

On mobile platforms, there's no URL or in-memory pre-buffer. Recording starts when the matching event is captured and continues for the rest of the session. A new session re-arms the trigger and requires a fresh matching event.

#### Triggering on exceptions

If you use [error tracking](/docs/error-tracking.md), exceptions are captured as events. You can select the exception event as an event trigger to start session recording.

#### How the trigger buffer works

When using URL or event triggers, the client buffers recording data in-memory while waiting for a trigger to match. Here's how it works:

-   While waiting for a trigger ("trigger pending"), the client takes a **full snapshot once per minute**
-   Only data from the **most recent snapshot** up to when the trigger fires is kept
-   This means the buffer contains **up to 1 minute** of activity before the trigger

The actual buffered duration varies depending on timing. For example:

-   If a snapshot was taken 45 seconds before the trigger fires, you'll see ~45 seconds of activity before the trigger
-   If a snapshot was taken 5 seconds before the trigger fires, you'll only see ~5 seconds of activity

This approach balances providing useful context with browser performance — keeping multiple snapshots would be more expensive for the browser.

**Page refreshes clear the buffer**

Full page navigations (page refreshes) clear the buffer and start over from a new snapshot.

### Feature flag triggers

You can select a [feature flag](/docs/feature-flags.md) to control whether to record sessions or not. Recordings will only be collected for users when the flag is enabled for them.

1.  [Create a boolean or multiple variant flag](/docs/feature-flags/creating-feature-flags.md) that determines whether to record sessions or not.
2.  Go to the [replay ingestion settings page](https://app.posthog.com/replay/settings#selectedSetting=replay-triggers).
3.  Link your newly created flag in the trigger group's **Feature flag** condition.

### Minimum duration

In your [replay ingestion settings](https://app.posthog.com/replay/settings#selectedSetting=replay-triggers), you can set a minimum duration for sessions to be recorded. Each trigger group carries its own minimum duration.

Supported on the following SDKs:

| Platform | Minimum version |
| --- | --- |
| [Web](/docs/libraries/js.md) | posthog-js 1.291.0+ |
| [iOS](/docs/libraries/ios.md) | 3.53.0+ |
| [Android](/docs/libraries/android.md) | 3.44.0+ |
| [React Native](/docs/libraries/react-native.md) | 4.52.0+ |
| [Flutter](/docs/libraries/flutter.md) | 5.24.3+ |

Use this to exclude sessions that are too short to be useful. For example, you might want to exclude sessions that are less than 2 seconds long to avoid recording sessions where users quickly bounce off your site.

#### How minimum duration is enforced

In strict mode (`strictMinimumDuration: true`), the minimum duration is checked against the **actual buffered recording data** (from first to last timestamp), not the session age. We only start sending the recording once we have the minimum duration of continuous data in the buffer.

Strict mode is the default on posthog-js 1.291.0+ for any `defaults` of `2025-11-30` or later. Projects on an earlier `defaults`, or none at all, get [legacy mode](#legacy-minimum-duration-mode). To set it explicitly:

Web

PostHog AI

```javascript
posthog.init('<ph_project_token>', {
  api_host: 'https://us.i.posthog.com',
  session_recording: {
    strictMinimumDuration: true
  }
})
```

**Key difference**: If the user navigates to a new page before reaching the minimum duration, the buffer is cleared and we start over. The recording will only be sent once we have enough **continuous data** on a single page.

For example, with a 12 second minimum:

-   User visits page A for 6 seconds, then navigates to page B
-   The buffer is cleared on navigation
-   User must stay on page B for 12 seconds before we start sending the recording
-   Result: You get the full recording from page B once it reaches 12 seconds

Once a session has passed the minimum duration threshold on any page, subsequent page navigations in the same session will continue to send recordings **immediately**.

This mode is **more accurate** for filtering out short sessions, especially on sites with full page refreshes, but may result in missing more session data if users **bounce quickly** across multiple pages.

#### Mobile behavior

On mobile, minimum duration is enforced using **buffer length**, similar to web strict mode:

-   Snapshots are buffered, and PostHog checks the duration of buffered replay data (from the oldest to newest buffered snapshot)
-   Recording starts sending only after that buffered duration reaches the configured minimum duration
-   After this threshold is reached once in a session, new snapshots are sent normally for the rest of that session

If the session changes before the threshold is reached, the buffer is cleared, and the next session starts buffering from zero.

### Combining controls

Each trigger group has a match type that decides how its conditions combine:

-   **ANY** — the group matches if any one of its conditions matches
-   **ALL** — the group matches only if every one of its conditions matches

Groups themselves are always combined with ANY: a session is recorded if it matches any group.

The sample rate is not a condition. It's applied after a group's conditions match, to whatever survived them. So a group with an exception event trigger and a 20% sample rate records 20% of the sessions that threw an exception — not 20% of all sessions plus every exception.

For example, take one group with an event trigger for exception events and a URL trigger for your checkout page:

-   **With ANY matching**, you'll capture sessions that threw an exception anywhere, and sessions that visited checkout.
-   **With ALL matching**, you'll capture only sessions that threw an exception while on checkout.

To record both patterns independently at different rates, use two groups rather than one.

## Programmatic start and stop controls

## Web

1.  For older projects, there is a section for 'Authorized domains for replay' in the [project replay settings](https://us.posthog.com/settings/environment-replay#replay-authorized-domains). Ensure your domain is added if the section is present.

2.  Set `disable_session_recording: true` in your [config](/docs/libraries/js/config.md).

Web

PostHog AI

```javascript
posthog.init('<ph_project_token>', {
  api_host: 'https://us.i.posthog.com',
  defaults: '2026-05-30',
    disable_session_recording: true,
    // ... other options
})
```

3.  Manually start recording by calling `posthog.startSessionRecording()`. Similarly, you can stop the recording at any point by calling `posthog.stopSessionRecording()`.

By default, `startSessionRecording` obeys any ingestion controls you've set - so you might call start and not record a session because of sampling or some other control.

You can pass override options to `startSessionRecording` to change this.

PostHog AI

```
posthog.startSessionRecording(true) // start ignoring all ingestion controls
posthog.startSessionRecording({
  // you don't have to send all of these
  sampling: true || false;
  linked_flag: true || false;
  url_trigger: true || false;
  event_trigger: true || false
})
```

> **Note:** Calling these methods will have no effect if session recordings are disabled in your PostHog [Project Settings](https://app.posthog.com/project/settings).

## iOS

> Requires PostHog iOS SDK version >= [3.19.0](https://github.com/PostHog/posthog-ios/releases/tag/3.19.0).

Setting `config.sessionReplay = false` in your PostHog configuration will prevent PostHog from automatically starting session recordings on SDK setup.

You can manually control when to start and stop session recordings using the following methods:

-   `startSessionRecording(resumeCurrent: Bool)`
    -   Set **resumeCurrent** to `true` to resume a previous session recording (Default).
    -   Set **resumeCurrent** to `false` to start a new session recording.
-   `stopSessionRecording()`
    -   Stops/pauses the current session recording.

> **Note:** Calling these methods will have no effect if session recordings are disabled in your PostHog [Project Settings](https://app.posthog.com/project/settings). Manual starts still respect project ingestion controls, including sampling and event triggers.

#### Record or ignore specific screens

You can combine these methods with your navigation to record only certain screens, or to pause recording on sensitive ones. For example, using a `UINavigationControllerDelegate`, stop recording when a sensitive screen appears and resume otherwise:

Swift

PostHog AI

```swift
let ignoredScreens: Set<String> = ["PaymentViewController", "SettingsViewController"]
func navigationController(
    _ navigationController: UINavigationController,
    didShow viewController: UIViewController,
    animated: Bool
) {
    let screenName = String(describing: type(of: viewController))
    if ignoredScreens.contains(screenName) {
        PostHogSDK.shared.stopSessionRecording()
    } else {
        PostHogSDK.shared.startSessionRecording()
    }
}
```

Invert the check (`startSessionRecording` only for screens in an allowlist, `stopSessionRecording` otherwise) if you'd rather record just a specific set of screens.

## Android

> Requires PostHog Android SDK version >= [3.16.0](https://github.com/PostHog/posthog-android/releases/tag/3.16.0).

Setting `config.sessionReplay = false` in your PostHog configuration will prevent PostHog from automatically starting session recordings on SDK setup.

You can manually control when to start and stop session recordings using the following methods:

-   `startSessionReplay(resumeCurrent: Boolean)`
    -   Set **resumeCurrent** to `true` to resume a previous session recording (Default).
    -   Set **resumeCurrent** to `false` to start a new session recording.
-   `stopSessionReplay()`
    -   Stops/pauses the current session recording.

> **Note:** Calling these methods will have no effect if session recordings are disabled in your PostHog [Project Settings](https://app.posthog.com/project/settings).

#### Record or ignore specific screens

You can combine these methods with your navigation to record only certain screens, or to pause recording on sensitive ones. For example, registering `ActivityLifecycleCallbacks`, stop recording when a sensitive activity resumes and resume otherwise:

Kotlin

PostHog AI

```kotlin
val ignoredScreens = setOf("PaymentActivity", "SettingsActivity")
application.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
    override fun onActivityResumed(activity: Activity) {
        if (activity::class.simpleName in ignoredScreens) {
            PostHog.stopSessionReplay()
        } else {
            PostHog.startSessionReplay()
        }
    }
    // Other lifecycle callbacks can be left empty
    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
    override fun onActivityStarted(activity: Activity) {}
    override fun onActivityPaused(activity: Activity) {}
    override fun onActivityStopped(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
})
```

Invert the check (`startSessionReplay` only for screens in an allowlist, `stopSessionReplay` otherwise) if you'd rather record just a specific set of screens.

## React Native

> Requires `posthog-react-native` >= [4.36.0](https://github.com/PostHog/posthog-js/releases) and `posthog-react-native-session-replay` >= [1.3.0](https://github.com/PostHog/posthog-react-native-session-replay/releases). From `posthog-react-native` 4.47.0+, `posthog-react-native-session-replay` is renamed to `@posthog/react-native-plugin` (>= 2.0.1).

Setting `sessionReplay` to `false` in your PostHog configuration will prevent PostHog from automatically starting session recordings on SDK setup.

You can manually control when to start and stop session recordings using the following methods:

-   `startSessionRecording(resumeCurrent?: boolean)`
    -   Set **resumeCurrent** to `true` to resume a previous session recording (Default).
    -   Set **resumeCurrent** to `false` to start a new session recording.
-   `stopSessionRecording()`
    -   Stops/pauses the current session recording.

typescript

PostHog AI

```typescript
// Start recording (resume current session)
await posthog.startSessionRecording()
// Start recording with a new session
await posthog.startSessionRecording(false)
// Stop recording
await posthog.stopSessionRecording()
```

> **Note:** Calling these methods will have no effect if session recordings are disabled in your PostHog [Project Settings](https://app.posthog.com/project/settings).

#### Record or ignore specific screens

You can combine these methods with your navigation to record only certain screens, or to pause recording on sensitive ones. For example, using `@react-navigation/native`, stop recording when a sensitive screen is focused and resume when the user leaves:

typescript

PostHog AI

```typescript
import { useNavigationContainerRef } from '@react-navigation/native'
import { usePostHog } from 'posthog-react-native'
const IGNORED_SCREENS = ['Payment', 'Settings']
function useRecordingByScreen(navigationRef: ReturnType<typeof useNavigationContainerRef>) {
    const posthog = usePostHog()
    useEffect(() => {
        return navigationRef.addListener('state', () => {
            const routeName = navigationRef.getCurrentRoute()?.name
            if (routeName && IGNORED_SCREENS.includes(routeName)) {
                void posthog.stopSessionRecording()
            } else {
                void posthog.startSessionRecording()
            }
        })
    }, [navigationRef, posthog])
}
```

Invert the check (`startSessionRecording` only for screens in an allowlist, `stopSessionRecording` otherwise) if you'd rather record just a specific set of screens.

## Flutter

> Requires PostHog Flutter SDK version >= [5.14.0](https://github.com/PostHog/posthog-flutter/releases/5.14.0). Available on iOS, Android, and Web.

Setting `config.sessionReplay = false` in your PostHog configuration will prevent PostHog from automatically starting session recordings on SDK setup.

You can manually control when to start and stop session recordings using the following methods:

-   `startSessionRecording({bool resumeCurrent = true})`
    -   Set **resumeCurrent** to `true` to resume a previous session recording (default).
    -   Set **resumeCurrent** to `false` to start a new session recording.
-   `stopSessionRecording()`
    -   Stops/pauses the current session recording.

> **Note:** Calling these methods will have no effect if session recordings are disabled in your PostHog [Project Settings](https://app.posthog.com/project/settings). Manual starts still respect project ingestion controls, including sampling and event triggers.

#### Record or ignore specific screens

You can combine these methods with your navigation to record only certain screens, or to pause recording on sensitive ones. For example, using a `NavigatorObserver`, stop recording on a sensitive route and resume otherwise:

Dart

PostHog AI

```dart
const ignoredScreens = {'Payment', 'Settings'};
class RecordingByScreenObserver extends NavigatorObserver {
  void _update(Route<dynamic>? route) {
    final screenName = route?.settings.name;
    if (screenName != null && ignoredScreens.contains(screenName)) {
      Posthog().stopSessionRecording();
    } else {
      Posthog().startSessionRecording();
    }
  }
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) => _update(route);
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) => _update(previousRoute);
}
// Then register it on your MaterialApp:
// navigatorObservers: [RecordingByScreenObserver()]
```

Invert the check (`startSessionRecording` only for screens in an allowlist, `stopSessionRecording` otherwise) if you'd rather record just a specific set of screens.

## Legacy controls

Since posthog-js 1.369.0, all of these controls live in [trigger groups](#trigger-groups). The settings below are kept for backward compatibility. You get them in either of these cases:

| Your SDK | What you get |
| --- | --- |
| posthog-js before 1.369.0 | Always the legacy controls below |
| posthog-js 1.369.0 or later | Trigger groups, unless your project has no groups configured |

If you are using the controls below, upgrade to a current SDK and migrate your configuration to trigger groups.

### Migrating to trigger groups

If you have existing legacy trigger settings (URL triggers, event triggers, feature flags, sampling, and match type configured outside of trigger groups), you can automatically convert them to trigger groups.

1.  Go to the [replay ingestion settings page](https://app.posthog.com/replay/settings#selectedSetting=replay-triggers).
2.  Click **Create from legacy triggers** in the **Trigger groups** section.
3.  Review the preview of trigger groups that will be created.
4.  Click **Create** to confirm.

You can edit the groups after creating them.

**ANY matching with sampling migrates to two groups**

When your legacy settings use "ANY" match type with both trigger conditions (URLs, events, or feature flags) **and** sampling below 100%, the migration creates two groups:

1.  A group with your trigger conditions at a 100% sample rate
2.  A group with no conditions at your legacy sample rate

This preserves the original behavior where recording starts if **any** condition matches **or** the session was sampled.

### Project-wide match type and sampling

**Applies to posthog-js 1.238.0 through 1.368.x, and to 1.369.0 or later when no trigger groups are configured.** Match type arrived in 1.238.0. Before that, you could not choose how triggers combined.

In this configuration, match type and sampling apply to the project as a whole rather than per group. You choose whether recording starts when all triggers match, or when any trigger matches.

For example if you set an event trigger for Exception events, a URL trigger for the checkout page, and sampling to 20%.

**With any matching**, you'll capture 20% of every session, and any session that has an exception event or is on the checkout page.

**With all matching**, you'll capture 20% of any session on the checkout page that has an exception event.

**Legacy only: 100% sampling with ANY matching records every session**

If you use "any" matching with 100% sampling and other conditions (URL triggers, event triggers, or feature flags), the 100% sampling causes every session to be recorded. Your other conditions become ineffective because the sampling condition alone matches every session.

To fix this, either lower your sample rate or switch to "all" matching.

This trap does not apply to trigger groups, where the sample rate is applied after a group's conditions match rather than as another condition alongside them.

### Legacy minimum duration mode

**Applies to posthog-js 1.291.0 or later with a `defaults` earlier than `2025-11-30`, or with no `defaults` set. Before 1.291.0 there was no strict mode, so this was the only behavior.**

In legacy mode (`strictMinimumDuration: false` or not set), the minimum duration is checked against the **total session age**. When a session starts, the browser records the start time. If the minimum duration has passed since the session start time, the recording data is sent to the backend.

This is what you get when your [`defaults`](/docs/libraries/js/config.md) config is earlier than `2025-11-30`, or is not set. To opt in explicitly:

Web

PostHog AI

```javascript
posthog.init('<ph_project_token>', {
  api_host: 'https://us.i.posthog.com',
  session_recording: {
    strictMinimumDuration: false
  }
})
```

**Limitation**: If you set a high minimum duration and your user visits multiple pages (causing full page refreshes), the in-memory buffer may be cleared by navigation. When the session reaches the minimum age, we'll start sending data, but you might miss the beginning of the session because the buffer was cleared by the page refresh.

For example, with a 12 second minimum:

-   User visits page A for 6 seconds, then navigates to page B
-   After 6 more seconds on page B (12 seconds total session age), we start sending the recording
-   Result: You get 6 seconds of recording from page B, but miss the 6 seconds from page A

Use legacy mode if you want to capture as much session data as possible and are okay with potentially missing early parts of sessions after page refreshes. Use [strict mode](#how-minimum-duration-is-enforced) if you want to only record sessions where users actually spend the minimum duration on a single page, accepting that you may miss more bouncing users.

## Billing limits

You can set a [billing limit](/docs/billing/limits-alerts.md). We'll stop ingesting recordings when you reach your limit.

### Still have questions?

Ask PostHog AI

### Was this page useful?

HelpfulCould be better