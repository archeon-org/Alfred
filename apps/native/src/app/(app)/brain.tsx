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
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

// Mock imports - Replace with your actual paths
import { RagAgentMode } from "../../services/search";
import { streamQuestion } from "../../services/question";
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
  confidence?: "high" | "medium" | "low";
  isStreaming?: boolean;
  searchStage?: string;
  streamSteps?: string[];
}

// --- Constants ---
const QUICK_SUGGESTIONS = [
  { icon: "document-text", text: "Summarize my recent uploads" },
  { icon: "search", text: "Find my contracts" },
  { icon: "calendar", text: "What bills are due?" },
  { icon: "briefcase", text: "Project overview" },
];

const STAGE_LABELS: Record<string, string> = {
  rewrite_query: "Rewriting your question...",
  retrieve_chunks: "Searching indexed evidence...",
  rerank_results: "Comparing matches...",
  assemble_context: "Assembling context...",
  generate_answer: "Drafting grounded answer...",
  finalize: "Finalizing response...",
};

// --- Sub-Components ---

// Search stage indicator with animated dots and live backend stage text
const SearchStageIndicator = ({
  stage,
  steps = [],
}: {
  stage?: string;
  steps?: string[];
}) => {
  const dotAnimations = useRef(
    [0, 1, 2].map(() => new Animated.Value(0)),
  ).current;

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
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dotAnimations]);

  return (
    <View>
      <View className="flex-row items-start">
        <View className="mr-2 h-5 w-5 items-center justify-center rounded-full bg-primary/15">
          <Ionicons name="sparkles" size={12} color="#6366F1" />
        </View>
        <Text className="mr-2 flex-1 text-sm leading-5 text-gray-600 dark:text-gray-400">
          {stage || "Thinking with your indexed documents..."}
        </Text>
        <View className="mt-1 flex-row items-center">
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

      {steps.length > 0 && (
        <View className="mt-2">
          {steps.slice(-4).map((step, index) => (
            <View
              key={`${step}-${index}`}
              className="mb-1 flex-row items-start"
            >
              <Text className="mr-2 text-[11px] text-gray-500 dark:text-gray-400">
                •
              </Text>
              <Text className="flex-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                {step}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

type InlineTokenType = "text" | "bold" | "italic" | "code";

interface InlineToken {
  type: InlineTokenType;
  value: string;
}

const parseInlineMarkdown = (value: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: "text",
        value: value.slice(lastIndex, match.index),
      });
    }

    const raw = match[0];
    if (raw.startsWith("**") && raw.endsWith("**")) {
      tokens.push({ type: "bold", value: raw.slice(2, -2) });
    } else if (raw.startsWith("`") && raw.endsWith("`")) {
      tokens.push({ type: "code", value: raw.slice(1, -1) });
    } else if (raw.startsWith("*") && raw.endsWith("*")) {
      tokens.push({ type: "italic", value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: "text", value: raw });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) {
    tokens.push({ type: "text", value: value.slice(lastIndex) });
  }

  return tokens;
};

const InlineMarkdown = ({
  content,
  isUser,
  className,
}: {
  content: string;
  isUser: boolean;
  className: string;
}) => {
  const tokens = parseInlineMarkdown(content);
  return (
    <Text
      className={`${className} ${
        isUser ? "text-white" : "text-gray-800 dark:text-gray-100"
      }`}
    >
      {tokens.map((token, index) => {
        if (token.type === "bold") {
          return (
            <Text key={index} className="font-semibold">
              {token.value}
            </Text>
          );
        }
        if (token.type === "italic") {
          return (
            <Text key={index} className="italic">
              {token.value}
            </Text>
          );
        }
        if (token.type === "code") {
          return (
            <Text
              key={index}
              className={`rounded px-1 ${
                isUser
                  ? "bg-white/20 text-white"
                  : "bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
              }`}
            >
              {token.value}
            </Text>
          );
        }
        return <Text key={index}>{token.value}</Text>;
      })}
    </Text>
  );
};

const MarkdownMessage = ({
  content,
  isUser,
}: {
  content: string;
  isUser: boolean;
}) => {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const flushCodeBlock = (key: string) => {
    if (!codeBuffer.length) {
      return;
    }
    elements.push(
      <View
        key={key}
        className={`mb-2 rounded-lg px-3 py-2 ${
          isUser ? "bg-white/15" : "bg-gray-100 dark:bg-gray-900"
        }`}
      >
        <Text
          className={`font-mono text-xs ${
            isUser ? "text-white" : "text-gray-800 dark:text-gray-200"
          }`}
        >
          {codeBuffer.join("\n")}
        </Text>
      </View>,
    );
    codeBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const key = `line-${index}`;

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock(`${key}-code-end`);
      }
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (!trimmed) {
      elements.push(<View key={`${key}-spacer`} className="h-2" />);
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingClass =
        level === 1
          ? "mb-1 text-xl font-bold"
          : level === 2
            ? "mb-1 text-lg font-semibold"
            : "mb-1 text-base font-semibold";
      elements.push(
        <InlineMarkdown
          key={`${key}-heading`}
          content={headingMatch[2]}
          isUser={isUser}
          className={headingClass}
        />,
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      elements.push(
        <View key={`${key}-bullet`} className="mb-1 flex-row items-start">
          <Text
            className={`mr-2 mt-[2px] ${
              isUser ? "text-white" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            •
          </Text>
          <View className="flex-1">
            <InlineMarkdown
              content={bulletMatch[1]}
              isUser={isUser}
              className="text-[15px] leading-6"
            />
          </View>
        </View>,
      );
      return;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      elements.push(
        <View key={`${key}-ordered`} className="mb-1 flex-row items-start">
          <Text
            className={`mr-2 mt-[2px] text-xs ${
              isUser ? "text-white" : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {orderedMatch[1]}.
          </Text>
          <View className="flex-1">
            <InlineMarkdown
              content={orderedMatch[2]}
              isUser={isUser}
              className="text-[15px] leading-6"
            />
          </View>
        </View>,
      );
      return;
    }

    const quoteMatch = trimmed.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      elements.push(
        <View
          key={`${key}-quote`}
          className={`mb-1 rounded-r-md border-l-2 pl-2 ${
            isUser ? "border-white/80" : "border-primary/50"
          }`}
        >
          <InlineMarkdown
            content={quoteMatch[1]}
            isUser={isUser}
            className="text-[14px] italic leading-6"
          />
        </View>,
      );
      return;
    }

    elements.push(
      <InlineMarkdown
        key={`${key}-paragraph`}
        content={line}
        isUser={isUser}
        className="mb-1 text-[15px] leading-6"
      />,
    );
  });

  if (codeBuffer.length) {
    flushCodeBlock("trailing-code");
  }

  return <View>{elements}</View>;
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

  if (!isUser && item.isStreaming && !item.content) {
    return (
      <View className="mb-6 flex-row items-start">
        <View className="mr-2 mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/20">
          <Ionicons name="sparkles" size={16} color="#6366F1" />
        </View>
        <View style={{ maxWidth: SCREEN_WIDTH * 0.82 }} className="flex-1">
          <View
            className="rounded-2xl rounded-bl-none border border-gray-100 bg-surface px-4 py-3 dark:border-gray-800 dark:bg-surface-dark"
            style={shadows.sm}
          >
            <SearchStageIndicator
              stage={item.searchStage}
              steps={item.streamSteps || []}
            />
          </View>
        </View>
      </View>
    );
  }

  if (!isUser) {
    return (
      <View className="mb-6 flex-row items-start">
        <View className="mr-2 mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/20">
          <Ionicons name="sparkles" size={16} color="#6366F1" />
        </View>
        <View style={{ maxWidth: SCREEN_WIDTH * 0.82 }} className="flex-1">
          <Pressable onLongPress={handleLongPress} delayLongPress={500}>
            <MarkdownMessage content={item.content} isUser={false} />
          </Pressable>

          {item.isStreaming && (
            <View className="mt-3 rounded-2xl border border-gray-100 bg-surface px-4 py-3 dark:border-gray-800 dark:bg-surface-dark">
              <SearchStageIndicator
                stage={item.searchStage}
                steps={item.streamSteps || []}
              />
            </View>
          )}

          <View className="mt-2 ml-1">
            <View className="flex-row items-center space-x-3">
              <Text className="text-[10px] text-gray-500">
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              {item.confidence && (
                <View className="flex-row items-center rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                  <View
                    className={`mr-1 h-1.5 w-1.5 rounded-full ${
                      item.confidence === "high"
                        ? "bg-emerald-500"
                        : item.confidence === "medium"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                  />
                  <Text className="text-[9px] font-medium text-gray-500 dark:text-gray-300 capitalize">
                    {item.confidence}
                  </Text>
                </View>
              )}
              <Text className="text-[9px] text-gray-500 ml-auto">
                Hold to copy
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-6 flex-row justify-end">
      <View style={{ maxWidth: SCREEN_WIDTH * 0.82 }}>
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={500}
          className="rounded-3xl rounded-br-md border border-primary bg-primary px-5 py-3.5"
        >
          <MarkdownMessage content={item.content} isUser />
        </Pressable>
      </View>
    </View>
  );
};

// --- Main Component ---

export default function BrainScreen() {
  const [messages, setMessages] = useState<BrainMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<RagAgentMode>("normal");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const flatListRef = useRef<FlatList>(null);

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

  // Helper: Generate unique ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const updateStreamingStatus = useCallback(
    (messageId: string, stage: string) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId) {
            return message;
          }
          const previousSteps = message.streamSteps || [];
          const shouldAddStep =
            !previousSteps.length ||
            previousSteps[previousSteps.length - 1] !== stage;
          return {
            ...message,
            searchStage: stage,
            streamSteps: shouldAddStep
              ? [...previousSteps, stage].slice(-8)
              : previousSteps,
          };
        }),
      );
    },
    [setMessages],
  );

  const appendStreamingDelta = useCallback(
    (messageId: string, delta: string) => {
      if (!delta) {
        return;
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: `${message.content || ""}${delta}`,
              }
            : message,
        ),
      );
    },
    [setMessages],
  );

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
      setShowModeMenu(false);
      scrollToBottom();

      // Add streaming placeholder
      const assistantMessageId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          isStreaming: true,
          searchStage: "Preparing retrieval plan...",
          streamSteps: ["Preparing retrieval plan..."],
        },
      ]);
      scrollToBottom();

      try {
        const conversationHistory = messages
          .filter(
            (m) =>
              !m.isStreaming && (m.role === "user" || m.role === "assistant"),
          )
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await streamQuestion(
          messageText,
          conversationHistory,
          agentMode,
          (event) => {
            if (event.type === "event") {
              const normalizedStage =
                event.message ||
                (event.stage ? STAGE_LABELS[event.stage] : undefined) ||
                "Working...";
              updateStreamingStatus(assistantMessageId, normalizedStage);
              scrollToBottom();
              return;
            }

            if (event.type === "answer_delta") {
              appendStreamingDelta(assistantMessageId, event.delta || "");
              scrollToBottom();
              return;
            }

            if (event.type === "result" && event.answer) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        content: event.answer || message.content,
                      }
                    : message,
                ),
              );
            }
          },
        );

        // Success Haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: response.answer || message.content,
                  confidence: response.confidence,
                  timestamp: new Date().toISOString(),
                  isStreaming: false,
                  searchStage: undefined,
                }
              : message,
          ),
        );
      } catch (error) {
        console.error("Brain error:", error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content:
                    "I'm having trouble connecting right now. Please try again.",
                  isStreaming: false,
                  searchStage: undefined,
                  streamSteps: undefined,
                }
              : message,
          ),
        );
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    },
    [
      agentMode,
      appendStreamingDelta,
      inputText,
      isLoading,
      messages,
      updateStreamingStatus,
    ],
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
    >
      {/* Header */}
      <View className="relative z-20 border-b border-gray-100 bg-background/95 px-4 py-3 dark:border-gray-800 dark:bg-background-dark/95">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <LinearGradient
              colors={["#6366F1", "#4F46E5"]}
              className="mr-3 h-8 w-8 items-center justify-center rounded-xl"
            >
              <Ionicons name="sparkles" size={16} color="white" />
            </LinearGradient>
            <View>
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                Assistant
              </Text>
              <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {agentMode === "reasoning" ? "Deep mode" : "Fast mode"}
              </Text>
            </View>
          </View>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={clearChat}
              className="rounded-full border border-gray-100 bg-surface px-3 py-1.5 dark:border-gray-800 dark:bg-surface-dark"
            >
              <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showModeMenu && (
        <Pressable
          className="absolute inset-0 z-10"
          onPress={() => setShowModeMenu(false)}
        />
      )}

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
        <View className="relative px-4 pb-4 pt-2">
          {showModeMenu && (
            <View className="absolute bottom-16 left-4 right-4 z-30 rounded-3xl border border-gray-200 bg-surface px-2 py-2 dark:border-gray-700 dark:bg-surface-dark">
              <TouchableOpacity
                onPress={() => {
                  setAgentMode("normal");
                  setShowModeMenu(false);
                }}
                disabled={isLoading}
                className={`rounded-2xl px-4 py-3 ${
                  agentMode === "normal"
                    ? "bg-primary/10 dark:bg-primary/20"
                    : "bg-transparent"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text
                    className={`text-base ${
                      agentMode === "normal"
                        ? "font-semibold text-primary"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    Fast mode
                  </Text>
                  {agentMode === "normal" ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#6366F1"
                    />
                  ) : null}
                </View>
                <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Lower latency answers
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setAgentMode("reasoning");
                  setShowModeMenu(false);
                }}
                disabled={isLoading}
                className={`mt-2 rounded-2xl px-4 py-3 ${
                  agentMode === "reasoning"
                    ? "bg-primary/10 dark:bg-primary/20"
                    : "bg-transparent"
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <Text
                    className={`text-base ${
                      agentMode === "reasoning"
                        ? "font-semibold text-primary"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    Deep mode
                  </Text>
                  {agentMode === "reasoning" ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#6366F1"
                    />
                  ) : null}
                </View>
                <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Wider retrieval and reasoning
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => setShowModeMenu((prev) => !prev)}
              disabled={isLoading}
              className={`mr-2 h-11 w-11 items-center justify-center rounded-full border ${
                showModeMenu
                  ? "border-primary/60 bg-primary/10 dark:bg-primary/20"
                  : "border-gray-100 bg-surface dark:border-gray-800 dark:bg-surface-dark"
              }`}
            >
              <Ionicons
                name="add"
                size={20}
                color={showModeMenu ? "#6366F1" : "#9CA3AF"}
              />
            </TouchableOpacity>
            <View
              className="flex-1 flex-row items-end rounded-[28px] border border-gray-200 bg-surface px-2 py-2 dark:border-gray-800 dark:bg-surface-dark"
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
                    ? "bg-gray-100 dark:bg-gray-700"
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
          </View>
          <Text className="mt-2 text-center text-[10px] text-gray-400">
            AI can make mistakes.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
