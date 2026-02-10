import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
  LayoutAnimation,
  UIManager,
  Keyboard,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

// Mock imports - Replace with your actual paths
import { askQuestion } from "../../services/search";
import { useUser } from "../../hooks/useUser";
import { shadows } from "../../constants/shadows";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// --- Types ---
interface BrainMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: string[];
  confidence?: "high" | "medium" | "low";
  isTyping?: boolean;
  searchStage?: string; // Current search stage for thinking indicator
}

// --- Constants ---
const QUICK_SUGGESTIONS = [
  { icon: "document-text", text: "Summarize my recent uploads" },
  { icon: "search", text: "Find my contracts" },
  { icon: "calendar", text: "What bills are due?" },
  { icon: "briefcase", text: "Project overview" },
];

// Search stages for the thinking indicator
const SEARCH_STAGES = [
  { text: "Searching documents...", icon: "search" as const, duration: 1500 },
  { text: "Analyzing context...", icon: "analytics" as const, duration: 2000 },
  {
    text: "Finding connections...",
    icon: "git-network" as const,
    duration: 1500,
  },
  { text: "Generating answer...", icon: "sparkles" as const, duration: 2000 },
];

// --- Sub-Components ---

// Search stage indicator with animated stages
const SearchStageIndicator = ({ stage }: { stage?: string }) => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const dotAnimations = useRef(
    [0, 1, 2].map(() => new Animated.Value(0))
  ).current;

  // Animate through search stages
  useEffect(() => {
    let stageTimeout: NodeJS.Timeout;
    let totalElapsed = 0;

    const advanceStage = () => {
      if (currentStageIndex < SEARCH_STAGES.length - 1) {
        // Fade out
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setCurrentStageIndex((prev) =>
            Math.min(prev + 1, SEARCH_STAGES.length - 1)
          );
          // Fade in
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        });

        totalElapsed += SEARCH_STAGES[currentStageIndex].duration;
        if (totalElapsed < 7000) {
          // Max 7 seconds of stages
          stageTimeout = setTimeout(
            advanceStage,
            SEARCH_STAGES[currentStageIndex + 1]?.duration || 2000
          );
        }
      }
    };

    stageTimeout = setTimeout(advanceStage, SEARCH_STAGES[0].duration);

    return () => clearTimeout(stageTimeout);
  }, [currentStageIndex, fadeAnim]);

  // Animate dots
  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        150,
        dotAnimations.map((anim) =>
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        )
      )
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const currentStage = SEARCH_STAGES[currentStageIndex];

  return (
    <View className="flex-row items-center">
      <Animated.View
        style={{ opacity: fadeAnim }}
        className="flex-row items-center"
      >
        <View className="mr-2 h-5 w-5 items-center justify-center rounded-full bg-primary/10">
          <Ionicons name={currentStage.icon} size={12} color="#6366F1" />
        </View>
        <Text className="text-sm text-gray-600 dark:text-gray-400 mr-1">
          {currentStage.text}
        </Text>
      </Animated.View>
      <View className="flex-row items-center">
        {dotAnimations.map((anim, i) => (
          <Animated.View
            key={i}
            style={{
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
            }}
            className="h-1.5 w-1.5 rounded-full bg-primary mx-0.5"
          />
        ))}
      </View>
    </View>
  );
};

const MessageBubble = ({
  item,
  onCopy,
}: {
  item: BrainMessage;
  onCopy: (text: string) => void;
}) => {
  const isUser = item.role === "user";

  // Long press handler to copy message
  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onCopy(item.content);
  }, [item.content, onCopy]);

  if (item.isTyping) {
    return (
      <View className="mb-6 flex-row items-end">
        <View className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/20">
          <Ionicons name="sparkles" size={16} color="#6366F1" />
        </View>
        <View
          className="rounded-2xl rounded-bl-none bg-surface dark:bg-surface-dark px-5 py-3.5"
          style={shadows.sm}
        >
          <SearchStageIndicator stage={item.searchStage} />
        </View>
      </View>
    );
  }

  return (
    <View
      className={`mb-6 flex-row ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <View className="mr-2 mt-auto h-8 w-8 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/20">
          <Ionicons name="sparkles" size={16} color="#6366F1" />
        </View>
      )}

      <View style={{ maxWidth: SCREEN_WIDTH * 0.82 }}>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={500}
          className={`px-5 py-3.5 ${
            isUser
              ? "rounded-2xl rounded-br-none bg-primary border border-primary"
              : "rounded-2xl rounded-bl-none bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-700"
          }`}
          style={isUser ? {} : shadows.sm}
        >
          <Text
            className={`text-[15px] leading-6 ${
              isUser ? "text-white" : "text-gray-800 dark:text-gray-100"
            }`}
          >
            {item.content}
          </Text>
        </Pressable>

        {/* Metadata Footer for AI Messages - Timestamp & Confidence only (sources removed) */}
        {!isUser && (
          <View className="mt-2 ml-1">
            <View className="flex-row items-center space-x-3">
              <Text className="text-[10px] text-gray-400">
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              {item.confidence && (
                <View className="flex-row items-center rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5">
                  <View
                    className={`mr-1 h-1.5 w-1.5 rounded-full ${
                      item.confidence === "high"
                        ? "bg-emerald-500"
                        : item.confidence === "medium"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                  />
                  <Text className="text-[9px] font-medium text-gray-500 capitalize">
                    {item.confidence}
                  </Text>
                </View>
              )}
              {/* Long press hint */}
              <Text className="text-[9px] text-gray-400 ml-auto">
                Hold to copy
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

// --- Main Component ---

export default function BrainScreen() {
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { data: user } = useUser();
  const touchStart = useRef({ y: 0 });

  // Handle copying message to clipboard
  const handleCopyMessage = useCallback(async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, []);

  const handleTouchStart = (e: any) => {
    touchStart.current.y = e.nativeEvent.pageY;
  };

  const handleTouchMove = (e: any) => {
    const touchEnd = e.nativeEvent.pageY;
    const diff = touchStart.current.y - touchEnd;

    // Detect downward swipe (negative difference when swiping down)
    if (diff < -30) {
      Keyboard.dismiss();
    }
  };

  // Helper: Generate unique ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = useCallback(
    async (text?: string) => {
      const messageText = text || inputText.trim();
      if (!messageText || isLoading) return;

      // Haptic feedback for interaction
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Animate layout changes
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      const userMessage: BrainMessage = {
        id: generateId(),
        role: "user",
        content: messageText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText("");
      setIsLoading(true);
      scrollToBottom();

      // Add typing placeholder
      const typingId = generateId();
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: typingId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            isTyping: true,
          },
        ]);
        scrollToBottom();
      }, 300); // Slight delay for natural feel

      try {
        const conversationHistory = messages
          .filter(
            (m) => !m.isTyping && (m.role === "user" || m.role === "assistant")
          )
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await askQuestion(messageText, conversationHistory);

        // Success Haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

        const assistantMessage: BrainMessage = {
          id: generateId(),
          role: "assistant",
          content: response.answer,
          timestamp: new Date().toISOString(),
          sources: response.sources,
          confidence: response.confidence,
        };

        setMessages((prev) =>
          prev.filter((m) => m.id !== typingId).concat(assistantMessage)
        );
      } catch (error) {
        console.error("Brain error:", error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        setMessages((prev) =>
          prev
            .filter((m) => m.id !== typingId)
            .concat({
              id: generateId(),
              role: "assistant",
              content:
                "I'm having trouble connecting right now. Please try again.",
              timestamp: new Date().toISOString(),
            })
        );
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    },
    [inputText, isLoading, messages]
  );

  const clearChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMessages([]);
  };

  const renderWelcome = () => (
    <View className="flex-1 items-center justify-center px-6 pt-10">
      <View className="mb-10 items-center">
        <View className="mb-6 h-24 w-24 items-center justify-center rounded-3xl bg-primary-50 dark:bg-primary-900/30">
          <LinearGradient
            colors={["#818CF8", "#6366F1"]}
            className="h-16 w-16 items-center justify-center rounded-2xl"
          >
            <Ionicons name="sparkles" size={32} color="white" />
          </LinearGradient>
        </View>
        <Text className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">
          Second Brain
        </Text>
        <Text className="text-center text-base leading-6 text-gray-500 dark:text-gray-400">
          Ask questions about your documents,{"\n"}contracts, and notes.
        </Text>
      </View>

      <View className="w-full">
        <Text className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
          Suggestions
        </Text>
        <View className="flex-row flex-wrap justify-between">
          {QUICK_SUGGESTIONS.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleSend(item.text)}
              className="mb-3 w-[48%] rounded-xl border border-gray-200 bg-surface p-4 dark:border-gray-700 dark:bg-surface-dark"
              activeOpacity={0.6}
            >
              <View className="mb-2 h-8 w-8 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
                <Ionicons name={item.icon as any} size={16} color="#6366F1" />
              </View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {item.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top", "left", "right"]}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {/* Header */}
      <View className="z-10 flex-row items-center justify-between border-b border-gray-100 bg-background/90 px-4 py-3 backdrop-blur-md dark:border-gray-800 dark:bg-background-dark/90">
        <View className="flex-row items-center">
          <LinearGradient
            colors={["#6366F1", "#4F46E5"]}
            className="mr-3 h-8 w-8 items-center justify-center rounded-xl"
          >
            <Ionicons name="sparkles" size={16} color="white" />
          </LinearGradient>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Assistant
          </Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity
            onPress={clearChat}
            className="rounded-full bg-gray-200 px-3 py-1.5 dark:bg-gray-800"
          >
            <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Clear
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      <View className="flex-1">
        {messages.length === 0 ? (
          renderWelcome()
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={({ item }) => (
              <MessageBubble item={item} onCopy={handleCopyMessage} />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 20,
              paddingBottom: 40,
            }}
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* Copy Toast Notification */}
      {showCopyToast && (
        <View className="absolute bottom-32 left-0 right-0 items-center z-50">
          <View className="flex-row items-center bg-gray-900 dark:bg-gray-100 px-4 py-2.5 rounded-full shadow-lg">
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text className="text-sm font-medium text-white dark:text-gray-900 ml-2">
              Copied to clipboard
            </Text>
          </View>
        </View>
      )}

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        className="bg-background dark:bg-background-dark"
      >
        <View className="px-4 pb-4 pt-2">
          <View
            className="flex-row items-end rounded-[24px] border border-gray-200 bg-surface px-2 py-2 dark:border-gray-800 dark:bg-surface-dark"
            style={shadows.sm}
          >
            <TextInput
              className="max-h-32 flex-1 px-4 py-2.5 text-[16px] text-gray-900 dark:text-white"
              placeholder="Ask anything..."
              placeholderTextColor="#9CA3AF"
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlignVertical="center"
              editable={!isLoading}
            />
            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={!inputText.trim() || isLoading}
              className={`mb-1 h-9 w-9 items-center justify-center rounded-full transition-all ${
                !inputText.trim() || isLoading
                  ? "bg-gray-100 dark:bg-gray-800"
                  : "bg-primary"
              }`}
              style={!inputText.trim() || isLoading ? {} : shadows.md}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={!inputText.trim() || isLoading ? "#9CA3AF" : "white"}
                />
              )}
            </TouchableOpacity>
          </View>
          <Text className="mt-2 text-center text-[10px] text-gray-400">
            AI can make mistakes. Check references.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
