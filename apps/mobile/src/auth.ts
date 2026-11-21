import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { resolveAuthOrigin, sessionStoragePrefix } from "./auth-origin";

const configuredOrigin =
  process.env.EXPO_PUBLIC_API_ORIGIN ??
  (__DEV__ ? "http://127.0.0.1:58080" : undefined);
export const authOrigin = resolveAuthOrigin(configuredOrigin, __DEV__);

const options = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const storage = {
  getItem: (key: string) => SecureStore.getItem(key, options),
  getItemAsync: (key: string) => SecureStore.getItemAsync(key, options),
  setItem: (key: string, value: string) =>
    SecureStore.setItem(key, value, options),
  setItemAsync: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, options),
};

export const mobileAuth = authOrigin
  ? createAuthClient({
      baseURL: authOrigin,
      // The mobile session provider coordinates foreground checks with private screens.
      sessionOptions: { refetchOnWindowFocus: false },
      plugins: [
        expoClient({
          scheme: "kairn",
          storage,
          storagePrefix: sessionStoragePrefix(authOrigin),
          disableCache: true,
        }),
      ],
    })
  : undefined;
