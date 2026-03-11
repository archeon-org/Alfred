import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  Keyboard,
  Modal,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useChatSearch } from "../../hooks/useChatSearch";
import { useCanAiSearch } from "../../hooks/useSubscription";
import {
  DocumentSuggestion,
  RagAgentMode,
  RagCitation,
} from "../../services/search";
import Config from "../../constants/Config";
import { DocumentPreviewSheet } from "./DocumentPreviewSheet";

interface AISearchBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

export const AISearchBottomSheet: React.FC<AISearchBottomSheetProps> = ({
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState("");
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<RagAgentMode>("normal");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const {
    messages,
    isLoading,
    streamStage,
    streamSteps,
    streamAnswer,
    sendMessage,
    excludeDoc,
    clearChat,
    searchLimitInfo,
  } = useChatSearch();
  const {
    canSearch,
    dailyRemaining,
    totalRemaining,
    limit,
    bonusSearches,
    refetch: refetchSubscription,
  } = useCanAiSearch();

  const primaryColor = "#6366F1";

  const lastMessageCount = useRef(0);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Refetch subscription data when bottom sheet opens
  useEffect(() => {
    if (visible) {
      refetchSubscription();
    }
  }, [visible, refetchSubscription]);

  // Reset chat when closing
  const handleClose = useCallback(() => {
    clearChat();
    setInputText("");
    setShowModeMenu(false);
    onClose();
  }, [clearChat, onClose]);

  // Dynamic keyboard handling - works on all phones
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardVisible(true);
        Animated.timing(keyboardHeight, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === "ios" ? e.duration : 250,
          useNativeDriver: false,
        }).start();
        // Scroll to bottom when keyboard shows
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      },
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (e) => {
        setKeyboardVisible(false);
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration: Platform.OS === "ios" ? e.duration : 250,
          useNativeDriver: false,
        }).start();
      },
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [keyboardHeight]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
    lastMessageCount.current = messages.length;
  }, [messages]);

  // Scroll when loading state changes
  useEffect(() => {
    if (isLoading) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isLoading]);

  const handleContentSizeChange = useCallback(() => {
    if (messages.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const message = inputText.trim();
    setInputText("");
    setShowModeMenu(false);

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);

    await sendMessage(message, agentMode);
  };

  const handleDocumentPress = (docId: string) => {
    setPreviewDocId(docId);
  };

  const handleClosePreview = () => {
    setPreviewDocId(null);
  };

  const handleExcludeDocument = async (docId: string) => {
    await excludeDoc(docId);
    await sendMessage("That's not the one, show me other options", agentMode);
  };

  const formatSimilarity = (similarity: number) => {
    return `${Math.round(similarity * 100)}%`;
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.7)
      return "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800";
    if (similarity >= 0.5)
      return "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800";
    return "bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800";
  };

  const renderDocumentCard = (doc: DocumentSuggestion) => (
    <View
      key={doc.id}
      className={`rounded-2xl p-3 mb-2 ${getSimilarityColor(doc.similarity)}`}
    >
      <TouchableOpacity
        onPress={() => handleDocumentPress(doc.id)}
        className="flex-row items-center"
      >
        {/* Thumbnail */}
        <View className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 mr-3">
          {doc.thumbnailPath ? (
            <Image
              source={{
                uri: `${Config.API_URL}/documents/thumbnail/${doc.id}`,
              }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <Ionicons name="document-text" size={20} color={primaryColor} />
            </View>
          )}
        </View>

        {/* Info */}
        <View className="flex-1">
          <Text
            className="text-sm font-bold text-gray-900 dark:text-white"
            numberOfLines={1}
          >
            {doc.title || doc.originalName}
          </Text>
          <View className="flex-row items-center mt-1">
            {doc.categoryName && (
              <View className="flex-row items-center mr-2">
                <View
                  className="w-2 h-2 rounded-full mr-1"
                  style={{
                    backgroundColor: doc.categoryColor || primaryColor,
                  }}
                />
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  {doc.categoryName}
                </Text>
              </View>
            )}
            <View className="bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded-full">
              <Text className="text-xs font-medium text-primary">
                {formatSimilarity(doc.similarity)}
              </Text>
            </View>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </TouchableOpacity>

      {/* Not this one button */}
      <TouchableOpacity
        onPress={() => handleExcludeDocument(doc.id)}
        className="flex-row items-center justify-center mt-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg"
      >
        <Ionicons name="close-circle-outline" size={14} color="#9CA3AF" />
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 ml-1">
          Not this one
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderCitationCard = (citation: RagCitation, index: number) => (
    <TouchableOpacity
      key={`${citation.chunkId}-${index}`}
      onPress={() => handleDocumentPress(citation.documentId)}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 mb-2"
    >
      <View className="flex-row items-start">
        <Ionicons name="document-text-outline" size={14} color="#6B7280" />
        <Text
          className="ml-2 flex-1 text-xs text-gray-700 dark:text-gray-300"
          numberOfLines={2}
        >
          {citation.snippet}
        </Text>
      </View>
      <Text className="mt-1 text-[10px] text-gray-400">
        Match score: {Math.round(citation.score * 100)}%
      </Text>
    </TouchableOpacity>
  );

  const renderMessage = (message: (typeof messages)[0], index: number) => {
    const isUser = message.role === "user";

    return (
      <View
        key={index}
        className={`mb-4 ${isUser ? "items-end" : "items-start"}`}
      >
        {/* Message bubble */}
        <View
          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-primary rounded-br-sm"
              : "bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-bl-sm"
          }`}
        >
          <Text
            className={`text-base ${
              isUser
                ? "text-white font-medium"
                : "text-gray-900 dark:text-white"
            }`}
          >
            {message.content}
          </Text>
        </View>

        {/* Document suggestions - show top 3 by similarity */}
        {message.documents &&
          message.documents.length > 0 &&
          (() => {
            const topDocs = [...message.documents]
              .sort((a, b) => b.similarity - a.similarity)
              .slice(0, 3);
            return (
              <View className="w-full mt-3">
                <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2 ml-1">
                  Top {topDocs.length} match{topDocs.length !== 1 ? "es" : ""}:
                </Text>
                {topDocs.map(renderDocumentCard)}
              </View>
            );
          })()}

        {!isUser && message.citations && message.citations.length > 0 && (
          <View className="w-full mt-2">
            <Text className="text-xs text-gray-500 dark:text-gray-400 mb-2 ml-1">
              {message.citations.length} citation
              {message.citations.length > 1 ? "s" : ""}:
            </Text>
            {message.citations.slice(0, 2).map(renderCitationCard)}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-background dark:bg-background-dark">
        {/* Drag handle */}
        <View className="items-center pt-2 pb-1">
          <View className="w-9 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </View>

        {/* Header */}
        <View className="flex-row items-center px-4 py-2 border-b border-gray-100 dark:border-gray-800">
          <View className="flex-1">
            <Text className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              AI Search
            </Text>
            <View className="flex-row items-center">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Describe what you're looking for
              </Text>
              {/* Search limit badge */}
              <View className="ml-2 flex-row items-center bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded-full">
                <Ionicons name="search" size={10} color="#6366F1" />
                <Text className="text-xs font-medium text-primary ml-1">
                  {searchLimitInfo?.remainingSearches ?? dailyRemaining}
                  {(searchLimitInfo?.bonusSearches ?? bonusSearches) > 0
                    ? ` (+${searchLimitInfo?.bonusSearches ?? bonusSearches})`
                    : ""}
                </Text>
              </View>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {messages.length > 0 && (
              <TouchableOpacity
                onPress={clearChat}
                className="w-10 h-10 rounded-full bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800 items-center justify-center"
              >
                <Ionicons name="refresh" size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleClose}
              className="w-10 h-10 rounded-full bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800 items-center justify-center"
            >
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}

        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4"
          contentContainerStyle={{
            paddingTop: 16,
            paddingBottom: 16,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={handleContentSizeChange}
        >
          {messages.length === 0 ? (
            <View className="flex-1 items-center justify-center py-8">
              <View className="w-16 h-16 rounded-full bg-primary/10 dark:bg-primary/20 items-center justify-center mb-4">
                <Ionicons name="sparkles" size={28} color={primaryColor} />
              </View>
              <Text className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                What are you looking for?
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 text-center px-8 mb-6">
                Describe the document you need and I'll help you find it
              </Text>

              {/* Suggestions */}
              <View className="w-full">
                <Text className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 ml-1">
                  Try saying
                </Text>
                {[
                  "My electricity bill from last month",
                  "The passport I scanned",
                  "Car insurance documents",
                ].map((suggestion, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setInputText(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="bg-surface dark:bg-surface-dark rounded-2xl px-4 py-3 mb-2 border border-gray-100 dark:border-gray-800 flex-row items-center"
                  >
                    <Ionicons
                      name="chatbubble-outline"
                      size={16}
                      color="#9CA3AF"
                    />
                    <Text className="text-sm text-gray-700 dark:text-gray-300 ml-3 flex-1">
                      {suggestion}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map(renderMessage)
          )}

          {/* Loading indicator */}
          {isLoading && (
            <View className="items-start mb-4">
              <View className="max-w-[85%] rounded-2xl rounded-bl-sm border border-gray-100 bg-surface px-4 py-3 dark:border-gray-800 dark:bg-surface-dark">
                <View className="mb-2 flex-row items-center">
                  <ActivityIndicator size="small" color={primaryColor} />
                  <Text className="ml-2 font-medium text-gray-500 dark:text-gray-400">
                    {streamStage || "Searching..."}
                  </Text>
                </View>

                {!!streamAnswer && (
                  <Text className="text-base text-gray-900 dark:text-white">
                    {streamAnswer}
                  </Text>
                )}

                {streamSteps.length > 0 && (
                  <View className="mt-2">
                    {streamSteps.slice(-4).map((step, index) => (
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
                {!streamAnswer && streamSteps.length === 0 && (
                  <Text className="text-xs text-gray-400">
                    Waiting for retrieval updates...
                  </Text>
                )}
              </View>
              {!!streamAnswer && (
                <View className="mt-2 ml-1">
                  <Text className="text-[10px] text-gray-500">
                    Streaming answer
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Input or Limit Reached Message */}
        <View className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-background dark:bg-background-dark">
          {(() => {
            // Calculate total remaining from either searchLimitInfo or subscription
            const currentDailyRemaining =
              searchLimitInfo?.remainingSearches ?? dailyRemaining;
            const currentBonusRemaining =
              searchLimitInfo?.bonusSearches ?? bonusSearches;
            const isExhausted =
              currentDailyRemaining + currentBonusRemaining <= 0;

            if (!canSearch && isExhausted) {
              return (
                // No searches remaining - show limit message
                <View className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl px-4 py-3 flex-row items-center">
                  <Ionicons name="time-outline" size={20} color="#F59E0B" />
                  <View className="flex-1 ml-3">
                    <Text className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Daily search limit reached
                    </Text>
                    <Text className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      Resets at midnight UTC
                    </Text>
                  </View>
                </View>
              );
            }

            return (
              // Normal input
              <View className="relative">
                {showModeMenu && (
                  <View className="absolute bottom-14 left-0 z-20 w-56 rounded-2xl border border-gray-200 bg-surface p-1 shadow-lg dark:border-gray-700 dark:bg-surface-dark">
                    <TouchableOpacity
                      onPress={() => {
                        setAgentMode("normal");
                        setShowModeMenu(false);
                      }}
                      disabled={isLoading}
                      className={`rounded-xl px-3 py-2 ${
                        agentMode === "normal"
                          ? "bg-primary/10 dark:bg-primary/20"
                          : "bg-transparent"
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          agentMode === "normal"
                            ? "font-semibold text-primary"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        Fast mode
                      </Text>
                      <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                        Lower latency search
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAgentMode("reasoning");
                        setShowModeMenu(false);
                      }}
                      disabled={isLoading}
                      className={`mt-1 rounded-xl px-3 py-2 ${
                        agentMode === "reasoning"
                          ? "bg-primary/10 dark:bg-primary/20"
                          : "bg-transparent"
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          agentMode === "reasoning"
                            ? "font-semibold text-primary"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        Deep mode
                      </Text>
                      <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                        Broader retrieval and cross-checks
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View className="flex-row items-end bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-2">
                  <TextInput
                    ref={inputRef}
                    placeholder="Describe what you're looking for..."
                    placeholderTextColor="#9CA3AF"
                    className="flex-1 text-base text-gray-900 dark:text-white max-h-24 py-2"
                    value={inputText}
                    onChangeText={setInputText}
                    onFocus={() => setShowModeMenu(false)}
                    multiline
                    onSubmitEditing={handleSend}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowModeMenu((prev) => !prev)}
                    disabled={isLoading}
                    className="ml-2 h-9 rounded-full border border-gray-200 dark:border-gray-700 px-3 items-center justify-center"
                  >
                    <Text className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      {agentMode === "reasoning" ? "Deep" : "Fast"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    className={`ml-2 w-10 h-10 rounded-full items-center justify-center ${
                      inputText.trim() && !isLoading
                        ? "bg-primary"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  >
                    <Ionicons
                      name="send"
                      size={18}
                      color={
                        inputText.trim() && !isLoading ? "white" : "#9CA3AF"
                      }
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>

        {/* Dynamic keyboard spacer - uses actual keyboard height or bottom safe area */}
        <Animated.View
          style={{
            height: keyboardVisible ? keyboardHeight : insets.bottom,
          }}
        />
      </View>

      {/* Document Preview Sheet */}
      <DocumentPreviewSheet
        visible={previewDocId !== null}
        documentId={previewDocId}
        onClose={handleClosePreview}
        onOpenFullDetails={() => {
          handleClosePreview();
          onClose();
        }}
      />
    </Modal>
  );
};
