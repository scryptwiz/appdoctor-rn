# Getting started

Target time: about five minutes. Use a **standalone** Expo or bare React Native app; install this package from npm (or `npm link` / `file:` while developing locally).

## 1. Install

```bash
npm install appdoctor-rn
```

Peers: `react`, `react-native`. For automatic screen events from the navigation tree, also install `@react-navigation/native` (v6+).

## 2. Wrap the app

At the root (above navigation if you use React Navigation):

```tsx
import {
  AppDoctorProvider,
  createConsoleTransport,
} from "appdoctor-rn";

export function Root() {
  return (
    <AppDoctorProvider
      transports={[createConsoleTransport({ label: "AppDoctor" })]}
      tags={{
        env: __DEV__ ? "development" : "production",
      }}
      context={{ platform: "react-native" }}
    >
      {/* Your app */}
    </AppDoctorProvider>
  );
}
```

## 3. React Navigation (optional but recommended)

Use the listener factory so each route change emits `screen_load` (`phase: "start"` and `phase: "ready"`):

```tsx
import { NavigationContainer } from "@react-navigation/native";
import {
  createNavigationStateListener,
  useAppDoctor,
} from "appdoctor-rn";
import { useMemo } from "react";

function Nav({ children }: { children: React.ReactNode }) {
  const client = useAppDoctor();
  const onStateChange = useMemo(
    () => createNavigationStateListener(client).listener,
    [client],
  );
  return (
    <NavigationContainer onStateChange={onStateChange}>
      {children}
    </NavigationContainer>
  );
}
```

`AppDoctorProvider` must wrap the tree that includes `NavigationContainer` so `useAppDoctor()` resolves.

## 4. Network

- **Fetch**: enabled by default (`instrumentFetch: true`). Set `instrumentFetch: false` on `AppDoctorProvider` if you patch `fetch` yourself.
- **Axios**: after creating your client, call `instrumentAxios(axios, appDoctorClient)` once (see [API reference](api-reference.md)).
- **Redaction**: use `redactNetworkEvent` on provider/client config (or Axios instrumentation options) to strip sensitive URL/query/path details.

## 5. Remote ingestion (optional)

Use `createHttpTransport({ url: "https://your-collector.example/events" })` alongside or instead of the console transport. The SDK posts JSON `{ events: [...] }` with retries and backoff on failure.

## 6. Local development against a git checkout

In your playground app:

```bash
npm install /absolute/path/to/app-doctor-sdk
```

Or publish a prerelease to npm and depend on the dist-tag you use for testing.

## Expo vs bare React Native

- **Expo**: same steps; ensure compatible `react-native` and `@react-navigation/native` versions for your SDK release.
- **Bare**: identical integration; native rebuild is only required when you change native dependencies unrelated to this library.

