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
import { DocumentSuggestion } from "../../services/search";
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
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const { messages, isLoading, sendMessage, excludeDoc, clearChat } =
    useChatSearch();

  const primaryColor = "#6366F1";

  const lastMessageCount = useRef(0);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Reset chat when closing
  const handleClose = useCallback(() => {
    clearChat();
    setInputText("");
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
      }
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
      }
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

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 50);

    await sendMessage(message);
  };

  const handleDocumentPress = (docId: string) => {
    setPreviewDocId(docId);
  };

  const handleClosePreview = () => {
    setPreviewDocId(null);
  };

  const handleExcludeDocument = async (docId: string) => {
    await excludeDoc(docId);
    await sendMessage("That's not the one, show me other options");
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
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Describe what you're looking for
            </Text>
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
              <View className="bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color={primaryColor} />
                  <Text className="text-gray-500 dark:text-gray-400 ml-2 font-medium">
                    Searching...
                  </Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-background dark:bg-background-dark">
          <View className="flex-row items-end bg-surface dark:bg-surface-dark border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-2">
            <TextInput
              ref={inputRef}
              placeholder="Describe what you're looking for..."
              placeholderTextColor="#9CA3AF"
              className="flex-1 text-base text-gray-900 dark:text-white max-h-24 py-2"
              value={inputText}
              onChangeText={setInputText}
              multiline
              onSubmitEditing={handleSend}
              returnKeyType="send"
              blurOnSubmit={false}
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
            />
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
                color={inputText.trim() && !isLoading ? "white" : "#9CA3AF"}
              />
            </TouchableOpacity>
          </View>
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
