import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PrivacyPolicy() {
  const router = useRouter();

  const sections = [
    {
      title: "1. Information We Collect",
      content:
        "We collect information to provide and improve Archeon:\n\n" +
        "Account Information:\n" +
        "• Email address\n" +
        "• Name (first and last)\n" +
        "• Profile picture (from Google Sign-In)\n" +
        "• Authentication provider details\n\n" +
        "Documents & Content:\n" +
        "• Documents you upload or scan\n" +
        "• Document metadata (titles, categories, tags)\n" +
        "• AI-generated classifications and descriptions\n\n" +
        "Usage Data:\n" +
        "• Storage usage statistics\n" +
        "• Search queries for improving AI accuracy\n" +
        "• App interaction data",
    },
    {
      title: "2. How We Use Your Information",
      content:
        "We use your information to:\n\n" +
        "• Provide document storage and organization services\n" +
        "• Enable AI-powered document classification and search\n" +
        "• Generate semantic embeddings for natural language search\n" +
        "• Send notifications about your documents (expiring items, etc.)\n" +
        "• Improve our AI models and service quality\n" +
        "• Communicate important service updates\n" +
        "• Ensure account security and prevent fraud",
    },
    {
      title: "3. Document Processing & AI",
      content:
        "When you upload documents, we:\n\n" +
        "• Store documents securely in cloud storage (Cloudflare R2)\n" +
        "• Process documents with OCR to extract text content\n" +
        "• Use AI (powered by Fireworks AI) to classify and generate titles\n" +
        "• Create vector embeddings for semantic search functionality\n\n" +
        "Your document content is processed solely for providing the service and is never sold or shared with third parties for advertising purposes.",
    },
    {
      title: "4. Data Storage & Security",
      content:
        "We implement robust security measures:\n\n" +
        "• Documents are stored in encrypted cloud storage\n" +
        "• Database connections are secured and encrypted\n" +
        "• Access tokens are stored securely on your device\n" +
        "• We use secure HTTPS connections for all data transfer\n" +
        "• Regular security audits and updates\n\n" +
        "While we take security seriously, no system is completely secure. Please protect your account credentials.",
    },
    {
      title: "5. Data Sharing",
      content:
        "We do not sell your personal data. We may share information with:\n\n" +
        "Service Providers:\n" +
        "• Cloud hosting (for document storage)\n" +
        "• AI services (for document processing)\n" +
        "• Authentication providers (Google)\n\n" +
        "Legal Requirements:\n" +
        "• When required by law or legal process\n" +
        "• To protect our rights or prevent fraud\n" +
        "• In connection with a merger or acquisition",
    },
    {
      title: "6. Your Rights & Choices",
      content:
        "You have the right to:\n\n" +
        "• Access your personal data and documents\n" +
        "• Export your documents at any time\n" +
        "• Delete individual documents\n" +
        "• Delete your entire account and all associated data\n" +
        "• Update your profile information\n" +
        "• Opt out of non-essential notifications\n\n" +
        "To exercise these rights, use the app settings or contact us.",
    },
    {
      title: "7. Data Retention",
      content:
        "We retain your data as follows:\n\n" +
        "• Active accounts: Data retained while account is active\n" +
        "• Deleted documents: Soft-deleted and removed from backups within 30 days\n" +
        "• Deleted accounts: All data permanently deleted within 30 days\n" +
        "• Embeddings: Deleted when associated documents are deleted\n\n" +
        "Some anonymized, aggregated data may be retained for analytics.",
    },
    {
      title: "8. Push Notifications",
      content:
        "With your permission, we may send push notifications for:\n\n" +
        "• Document processing status updates\n" +
        "• Expiring document reminders\n" +
        "• Important account or service updates\n\n" +
        "You can manage notification preferences in your device settings.",
    },
    {
      title: "9. Children's Privacy",
      content:
        "Archeon is not intended for users under 13 years of age. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us.",
    },
    {
      title: "10. International Data Transfer",
      content:
        "Your data may be processed in countries other than your own. By using Archeon, you consent to the transfer of your information to countries that may have different data protection laws.",
    },
    {
      title: "11. Changes to This Policy",
      content:
        "We may update this Privacy Policy periodically. We will notify you of significant changes through the app or via email. Continued use after changes constitutes acceptance.",
    },
    {
      title: "12. Contact Us",
      content:
        "For privacy-related questions or to exercise your data rights:\n\n" +
        "Email: privacy@archeon.app\n\n" +
        "We aim to respond to all privacy inquiries within 30 days.",
    },
  ];

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top", "bottom"]}
    >
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          className="w-10 h-10 rounded-full items-center justify-center bg-gray-100 dark:bg-gray-800"
        >
          <Ionicons name="chevron-back" size={24} color="#6b7280" />
        </TouchableOpacity>
        <Text className="flex-1 text-xl font-bold text-center text-gray-900 dark:text-white mr-10">
          Privacy Policy
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 py-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Last Updated */}
        <View className="mb-6">
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            Last updated: November 27, 2025
          </Text>
        </View>

        {/* Introduction */}
        <View className="mb-6 p-4 rounded-2xl bg-primary-50 dark:bg-primary-900/20">
          <View className="flex-row items-center mb-2">
            <Ionicons name="shield-checkmark" size={24} color="#6366F1" />
            <Text className="ml-2 text-lg font-bold text-gray-900 dark:text-white">
              Your Privacy Matters
            </Text>
          </View>
          <Text className="text-base text-gray-700 dark:text-gray-300 leading-6">
            At Archeon, we're committed to protecting your personal information
            and your documents. This policy explains how we collect, use, and
            safeguard your data.
          </Text>
        </View>

        {/* Key Points Summary */}
        <View className="mb-6 p-4 rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-gray-800">
          <Text className="text-base font-bold text-gray-900 dark:text-white mb-3">
            Key Points
          </Text>
          <View className="gap-2">
            {[
              "We never sell your personal data",
              "Your documents are encrypted in cloud storage",
              "AI processing is for your benefit only",
              "You can delete your data anytime",
              "You own all your content",
            ].map((point, index) => (
              <View key={index} className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={18} color="#14B8A6" />
                <Text className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  {point}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sections */}
        {sections.map((section, index) => (
          <View key={index} className="mb-6">
            <Text className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {section.title}
            </Text>
            <Text className="text-base text-gray-700 dark:text-gray-300 leading-6">
              {section.content}
            </Text>
          </View>
        ))}

        {/* Footer */}
        <View className="mt-4 mb-8 pt-6 border-t border-gray-100 dark:border-gray-800">
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
            © 2025 Archeon. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
