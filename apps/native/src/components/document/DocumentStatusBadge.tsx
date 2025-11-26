import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getStatusStyle } from "../../utils/documentUtils";

interface DocumentStatusBadgeProps {
  status: string;
}

export const DocumentStatusBadge = ({ status }: DocumentStatusBadgeProps) => {
  const statusStyle = getStatusStyle(status);

  return (
    <View
      className={`self-start flex-row items-center px-3 py-1.5 rounded-full ${statusStyle.container}`}
    >
      <Ionicons
        name={statusStyle.icon as any}
        size={14}
        className={`mr-1.5 ${statusStyle.text}`}
        style={{ marginRight: 6 }}
      />
      <Text className={`text-xs font-bold ${statusStyle.text}`}>
        {statusStyle.label}
      </Text>
    </View>
  );
};
