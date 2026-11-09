import React, { type ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

type Props = Omit<PressableProps, "style" | "children"> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionPressable({ children, style, pressedScale = 0.985, onPressIn, onPressOut, ...props }: Props) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <AnimatedPressable {...props} style={[style, animatedStyle]} onPressIn={(event) => { if (!reducedMotion) scale.value = withTiming(pressedScale, { duration: 120 }); onPressIn?.(event); }} onPressOut={(event) => { if (!reducedMotion) scale.value = withTiming(1, { duration: 120 }); onPressOut?.(event); }}>
      {children}
  </AnimatedPressable>;
}
