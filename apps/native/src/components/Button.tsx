import React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

interface ButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  variant?: "primary" | "secondary" | "outline";
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  variant = "primary",
  className = "",
}) => {
  const baseStyles =
    "py-3 px-6 rounded-lg flex-row justify-center items-center";

  const variants = {
    primary: "bg-blue-600",
    secondary: "bg-gray-600",
    outline: "bg-transparent border border-gray-300",
  };

  const textVariants = {
    primary: "text-white font-semibold",
    secondary: "text-white font-semibold",
    outline: "text-gray-700 font-semibold",
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isLoading}
      className={`${baseStyles} ${variants[variant]} ${className} ${isLoading ? "opacity-70" : ""}`}
    >
      {isLoading ? (
        <ActivityIndicator
          color={variant === "outline" ? "#374151" : "#ffffff"}
        />
      ) : (
        <Text className={`${textVariants[variant]} text-base`}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};
