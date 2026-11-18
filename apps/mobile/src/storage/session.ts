import * as SecureStore from "expo-secure-store";
import { localId } from "./namespace";

const options = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export function accountSession(accountId: string) {
  const key = `kairn.session.${localId(accountId)}`;
  return {
    read: () => SecureStore.getItemAsync(key, options),
    write: (value: string) => SecureStore.setItemAsync(key, value, options),
    clear: () => SecureStore.deleteItemAsync(key, options),
  };
}
