import { type ComponentProps, useState } from "react";
import { Image, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Field, focusOutline, touchTarget } from "./primitives";

const eye = require("../../../assets/auth/eye.png");
const eyeOff = require("../../../assets/auth/eye-off.png");

export function PasswordField(
  props: Omit<ComponentProps<typeof Field>, "suffix" | "secureTextEntry">,
) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      suffix={
        <PasswordVisibility
          visible={visible}
          disabled={props.editable === false || !!props.readOnly}
          toggle={() => setVisible((v) => !v)}
        />
      }
    />
  );
}

function PasswordVisibility({
  visible,
  disabled,
  toggle,
}: {
  visible: boolean;
  disabled: boolean;
  toggle: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Hide password" : "Show password"}
      disabled={disabled}
      onPress={toggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.eyeButton,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <Image
        source={visible ? eyeOff : eye}
        accessible={false}
        style={styles.eye}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create(({ semantic: { color, radius } }) => ({
  eyeButton: {
    minHeight: touchTarget,
    minWidth: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
  },
  eye: { width: 21, height: 21, tintColor: color.secondaryText },
  pressed: { backgroundColor: color.actionWash },
  focused: { ...focusOutline(color.focus) },
}));
