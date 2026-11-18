import { Text, View } from "react-native";
import { publicEnvironment } from "../env";

export default function IndexRoute() {
  return (
    <View>
      <Text accessibilityRole="header">{publicEnvironment.appName}</Text>
    </View>
  );
}
