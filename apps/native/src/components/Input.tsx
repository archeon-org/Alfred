import React, { forwardRef } from "react";
import { TextInput, Text, View, type TextInputProps } from "react-native";
import { cn } from "../utils/cn";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, className, containerClassName, ...props }, ref) => {
    return (
      <View className={cn("w-full gap-1.5", containerClassName)}>
        {label && (
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          className={cn(
            "w-full rounded-2xl border border-gray-200 bg-surface px-5 py-4 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-gray-900/50 dark:border-gray-700 dark:text-white",
            error &&
              "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            className,
          )}
          placeholderTextColor="#9CA3AF"
          {...props}
        />
        {error && <Text className="text-sm text-red-500">{error}</Text>}
      </View>
    );
  },
);

Input.displayName = "Input";
