import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  View,
  type PressableProps,
} from "react-native";
import { cn } from "../utils/cn";

interface ButtonProps extends PressableProps {
  title?: string;
  isLoading?: boolean;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  className?: string;
  textClassName?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  variant = "primary",
  className,
  textClassName,
  icon,
  children,
  disabled,
  ...props
}) => {
  const variants = {
    primary: "bg-primary active:bg-primary-700 shadow-sm shadow-primary/30",
    secondary: "bg-surface border border-gray-200 active:bg-gray-50 shadow-sm",
    outline: "bg-transparent border border-primary active:bg-primary-50",
    ghost: "bg-transparent active:bg-gray-100",
  };

  const textVariants = {
    primary: "text-white font-bold",
    secondary: "text-gray-900 font-semibold",
    outline: "text-primary font-semibold",
    ghost: "text-gray-600 font-medium",
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={isLoading || disabled}
      className={cn(
        "flex-row items-center justify-center rounded-2xl px-6 py-4",
        variants[variant],
        (isLoading || disabled) && "opacity-60",
        className
      )}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ busy: isLoading, disabled: disabled || isLoading }}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator
          color={
            variant === "outline" || variant === "ghost" ? "#374151" : "#ffffff"
          }
        />
      ) : (
        <>
          {icon && <View className="mr-2">{icon}</View>}
          {title ? (
            <Text
              className={cn("text-base", textVariants[variant], textClassName)}
            >
              {title}
            </Text>
          ) : (
            children
          )}
        </>
      )}
    </Pressable>
  );
};
