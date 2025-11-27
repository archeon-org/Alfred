import React from "react";
import { Image } from "react-native";

interface GoogleIconProps {
  size?: number;
}

export const GoogleIcon: React.FC<GoogleIconProps> = ({ size = 24 }) => {
  return (
    <Image
      source={require("../../assets/images/google-icon.png")}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
};
