import React, { useEffect, useRef } from "react";
import { Animated, ViewProps } from "react-native";
import { cn } from "../../utils/cn";

interface SkeletonProps extends ViewProps {
  className?: string;
}

export const Skeleton = ({ className, style, ...props }: SkeletonProps) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={cn("bg-gray-200 dark:bg-gray-800 rounded-xl", className)}
      style={[{ opacity }, style]}
      {...props}
    />
  );
};
