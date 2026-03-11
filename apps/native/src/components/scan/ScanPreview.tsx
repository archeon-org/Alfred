import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useColorScheme } from "nativewind";

interface ScanPreviewProps {
  scannedImages: string[];
  onRemovePage?: (index: number) => void;
  onAddMore?: () => void;
}

export const ScanPreview: React.FC<ScanPreviewProps> = ({
  scannedImages,
  onRemovePage,
  onAddMore,
}) => {
  const { width, height } = Dimensions.get("window");
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const cardWidth = width - 64;
  const cardHeight = height * 0.55;
  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(contentOffsetX / cardWidth);
    if (
      newIndex !== activeIndex &&
      newIndex >= 0 &&
      newIndex < scannedImages.length
    ) {
      setActiveIndex(newIndex);
    }
  };

  const scrollToIndex = (index: number) => {
    scrollViewRef.current?.scrollTo({
      x: index * cardWidth,
      animated: true,
    });
    setActiveIndex(index);
  };

  return (
    <View className="flex-1 w-full">
      {/* Header Stats */}
      <View className="flex-row items-center justify-between px-2 mb-4">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 items-center justify-center mr-3">
            <Ionicons name="documents" size={20} color="#6366F1" />
          </View>
          <View>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {scannedImages.length}{" "}
              {scannedImages.length === 1 ? "Page" : "Pages"}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Ready to upload
            </Text>
          </View>
        </View>
        <View className="bg-secondary-100 dark:bg-secondary-900/30 px-3 py-1.5 rounded-full">
          <Text className="text-secondary-700 dark:text-secondary-400 text-xs font-semibold">
            PDF Preview
          </Text>
        </View>
      </View>

      {/* Main Preview Carousel */}
      <View className="flex-1 mb-4">
        <Animated.ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true, listener: handleScroll },
          )}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={cardWidth}
          contentContainerStyle={{
            paddingHorizontal: 16,
          }}
        >
          {scannedImages.map((img, index) => {
            const inputRange = [
              (index - 1) * cardWidth,
              index * cardWidth,
              (index + 1) * cardWidth,
            ];

            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.9, 1, 0.9],
              extrapolate: "clamp",
            });

            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.6, 1, 0.6],
              extrapolate: "clamp",
            });

            return (
              <Animated.View
                key={index}
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  transform: [{ scale }],
                  opacity,
                }}
              >
                <View
                  className="flex-1 rounded-3xl overflow-hidden bg-surface dark:bg-surface-dark"
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: isDark ? 0.4 : 0.15,
                    shadowRadius: 24,
                    elevation: 12,
                  }}
                >
                  {/* Image Container */}
                  <View className="flex-1 bg-gray-100 dark:bg-gray-800">
                    {img.toLowerCase().endsWith(".pdf") ? (
                      isExpoGo ? (
                        <View className="flex-1 items-center justify-center p-4">
                          <View className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center mb-4">
                            <Ionicons
                              name="document-text"
                              size={40}
                              color={isDark ? "#9CA3AF" : "#6B7280"}
                            />
                          </View>
                          <Text className="text-gray-500 dark:text-gray-400 text-center text-sm">
                            PDF Preview not available{"\n"}in Expo Go
                          </Text>
                        </View>
                      ) : (
                        (() => {
                          const Pdf = require("react-native-pdf").default;
                          return (
                            <Pdf
                              source={{ uri: img, cache: true }}
                              style={{
                                flex: 1,
                                width: "100%",
                                backgroundColor: "transparent",
                              }}
                              fitPolicy={0}
                              enablePaging={true}
                              onError={(error: any) => {
                                console.log(error);
                              }}
                            />
                          );
                        })()
                      )
                    ) : (
                      <Image
                        source={{ uri: img }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    )}
                  </View>

                  {/* Bottom Gradient Overlay */}
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.7)"]}
                    className="absolute bottom-0 left-0 right-0 h-28"
                  />

                  {/* Page Info Footer */}
                  <View className="absolute bottom-0 left-0 right-0 p-4 flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center mr-2">
                        <Text className="text-white font-bold text-sm">
                          {index + 1}
                        </Text>
                      </View>
                      <Text className="text-white/80 text-sm">
                        of {scannedImages.length}
                      </Text>
                    </View>

                    {onRemovePage && (
                      <TouchableOpacity
                        onPress={() => onRemovePage(index)}
                        className="w-10 h-10 rounded-full bg-red-500/80 items-center justify-center"
                        style={{
                          shadowColor: "#EF4444",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                        }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="white"
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </Animated.ScrollView>
      </View>

      {/* Thumbnail Strip */}
      {scannedImages.length > 1 && (
        <View className="px-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingVertical: 8,
              gap: 8,
            }}
          >
            {scannedImages.map((img, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => scrollToIndex(index)}
                className={`rounded-xl overflow-hidden border-2 ${
                  activeIndex === index
                    ? "border-primary"
                    : "border-transparent"
                }`}
                style={{
                  shadowColor: activeIndex === index ? "#6366F1" : "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: activeIndex === index ? 0.3 : 0.1,
                  shadowRadius: 4,
                  elevation: activeIndex === index ? 6 : 2,
                }}
              >
                <View className="w-14 h-18 bg-surface dark:bg-surface-dark">
                  {img.toLowerCase().endsWith(".pdf") ? (
                    <View className="flex-1 items-center justify-center bg-gray-100 dark:bg-gray-700">
                      <Ionicons
                        name="document-text"
                        size={20}
                        color={isDark ? "#9CA3AF" : "#6B7280"}
                      />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: img }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  )}
                  {/* Page Number Badge */}
                  <View className="absolute bottom-1 right-1 bg-black/60 px-1.5 py-0.5 rounded">
                    <Text className="text-white text-[10px] font-bold">
                      {index + 1}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}

            {/* Add More Button */}
            {onAddMore && (
              <TouchableOpacity
                className="w-14 h-18 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 items-center justify-center bg-gray-50 dark:bg-gray-800"
                onPress={onAddMore}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color={isDark ? "#9CA3AF" : "#6B7280"}
                />
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* Single Page Indicator */}
      {scannedImages.length === 1 && (
        <View className="flex-row justify-center items-center py-2">
          <View className="w-8 h-1 rounded-full bg-primary" />
        </View>
      )}

      {/* Page Dots for multiple pages */}
      {scannedImages.length > 1 && scannedImages.length <= 5 && (
        <View className="flex-row justify-center items-center py-3 gap-2">
          {scannedImages.map((_, index) => (
            <TouchableOpacity key={index} onPress={() => scrollToIndex(index)}>
              <View
                className={`rounded-full ${
                  activeIndex === index
                    ? "w-6 h-2 bg-primary"
                    : "w-2 h-2 bg-gray-300 dark:bg-gray-600"
                }`}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};
