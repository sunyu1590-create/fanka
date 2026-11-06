import React, { type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

type Props = Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
};

export function MotionPressable({ children, style, pressedScale = 0.985, onPressIn, onPressOut, ...props }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[animatedStyle, style]}>
    <Pressable {...props} onPressIn={(event) => { scale.value = withSpring(pressedScale, { damping: 18, stiffness: 280 }); onPressIn?.(event); }} onPressOut={(event) => { scale.value = withSpring(1, { damping: 18, stiffness: 280 }); onPressOut?.(event); }}>
      {children}
    </Pressable>
  </Animated.View>;
}
