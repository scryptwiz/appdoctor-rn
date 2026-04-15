# App Doctor — React Native SDK

Lightweight performance and observability for React Native: screen timing, network latency, and a pluggable event pipeline with minimal setup.

## Install

```bash
npm install appdoctor-rn
```

Peer dependencies: `react`, `react-native`. Optional: `@react-navigation/native` for stack/tab navigation listeners.

## Quick start

1. Wrap your app with `AppDoctorProvider` and pass transports (for example `createConsoleTransport()`).
2. For React Navigation, pass `createNavigationStateListener(client).listener` to `NavigationContainer` as `onStateChange` (see [Getting started](docs/getting-started.md)).
3. Optionally use `useTrackScreen`, `useTrackRender`, `trackApi`, and `instrumentAxios` for extra coverage.

```tsx
import { NavigationContainer } from "@react-navigation/native";
import {
  AppDoctorProvider,
  createConsoleTransport,
  createNavigationStateListener,
  useAppDoctor,
} from "appdoctor-rn";
import { useMemo, type ReactNode } from "react";

function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppDoctorProvider
      transports={[createConsoleTransport()]}
      tags={{ env: __DEV__ ? "dev" : "prod" }}
      context={{ platform: "react-native" }}
    >
      <NavWithListener>{children}</NavWithListener>
    </AppDoctorProvider>
  );
}

function NavWithListener({ children }: { children: ReactNode }) {
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

## Documentation

- [Getting started (Expo & bare RN)](docs/getting-started.md)
- [API reference](docs/api-reference.md)
- [Performance budget](docs/performance-budget.md)
- [v0.1 release checklist](docs/release-checklist-v0.1.md)

## Scripts


| Script              | Description                       |
| ------------------- | --------------------------------- |
| `npm run build`     | Build `dist/` (CJS + ESM + types) |
| `npm test`          | Run Vitest                        |
| `npm run lint`      | ESLint                            |
| `npm run typecheck` | `tsc --noEmit`                    |


## License

MIT