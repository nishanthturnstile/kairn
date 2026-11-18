import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

const configuredOrigin =
  process.env.EXPO_PUBLIC_API_ORIGIN ??
  (__DEV__ ? "http://127.0.0.1:58080" : undefined);
const publicOrigin = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i;
const localOrigin = /^http:\/\/127\.0\.0\.1:\d+\/?$/;
export const authOrigin =
  configuredOrigin &&
  (publicOrigin.test(configuredOrigin) ||
    (__DEV__ && localOrigin.test(configuredOrigin)))
    ? configuredOrigin.replace(/\/$/, "")
    : undefined;

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
      plugins: [
        expoClient({
          scheme: "kairn",
          storage,
          storagePrefix: "kairn_auth",
          disableCache: true,
        }),
      ],
    })
  : undefined;
