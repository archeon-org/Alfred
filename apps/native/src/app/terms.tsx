import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TermsOfService() {
  const router = useRouter();

  const sections = [
    {
      title: "1. Acceptance of Terms",
      content:
        "By downloading, installing, or using Archeon, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.",
    },
    {
      title: "2. Description of Service",
      content:
        "Archeon is a personal document management application that allows you to:\n\n• Scan and digitize physical documents using your device's camera\n• Upload and store digital documents (PDFs, images)\n• Organize documents with categories and tags\n• Search your documents using AI-powered semantic search\n• Access your documents securely from your mobile device\n\nThe service includes AI-assisted features for document classification and title generation.",
    },
    {
      title: "3. User Accounts",
      content:
        "To use Archeon, you must create an account using Google Sign-In or email verification. You are responsible for:\n\n• Maintaining the confidentiality of your account credentials\n• All activities that occur under your account\n• Notifying us immediately of any unauthorized use\n\nYou must be at least 13 years old to use this service.",
    },
    {
      title: "4. User Content",
      content:
        "You retain all ownership rights to the documents and content you upload to Archeon. By using our service, you grant us a limited license to:\n\n• Store and process your documents on our secure servers\n• Generate AI-powered classifications and suggestions\n• Create searchable embeddings for semantic search functionality\n\nWe do not claim ownership of your content and will not share it with third parties except as required to provide the service.",
    },
    {
      title: "5. Acceptable Use",
      content:
        "You agree not to use Archeon to:\n\n• Upload illegal, harmful, or offensive content\n• Violate any applicable laws or regulations\n• Infringe on intellectual property rights of others\n• Attempt to gain unauthorized access to the service\n• Upload malware, viruses, or malicious code\n• Exceed your allocated storage limits through abuse",
    },
    {
      title: "6. Storage Limits",
      content:
        "Each account is provided with a storage allocation. We reserve the right to modify storage limits and may offer additional storage through paid plans. If you exceed your storage limit, you will not be able to upload new documents until space is freed.",
    },
    {
      title: "7. AI Features",
      content:
        "Archeon uses artificial intelligence for:\n\n• Automatic document classification\n• Title generation from document content\n• Semantic search capabilities\n• OCR (Optical Character Recognition)\n\nWhile we strive for accuracy, AI-generated results may not always be perfect. You can manually override any AI-generated classifications or titles.",
    },
    {
      title: "8. Service Availability",
      content:
        "We aim to provide reliable service but do not guarantee uninterrupted access. The service may be temporarily unavailable due to:\n\n• Scheduled maintenance\n• Technical issues or outages\n• Updates and improvements\n• Circumstances beyond our control",
    },
    {
      title: "9. Termination",
      content:
        "We may suspend or terminate your account if you violate these terms. You may delete your account at any time. Upon termination, your data will be deleted according to our data retention policy outlined in our Privacy Policy.",
    },
    {
      title: "10. Limitation of Liability",
      content:
        'Archeon is provided "as is" without warranties of any kind. We are not liable for:\n\n• Loss of data or documents\n• Service interruptions\n• Errors in AI-generated content\n• Damages arising from use of the service\n\nOur total liability is limited to the amount you paid for the service, if any.',
    },
    {
      title: "11. Changes to Terms",
      content:
        "We may update these terms from time to time. Continued use of Archeon after changes constitutes acceptance of the new terms. We will notify you of significant changes through the app or via email.",
    },
    {
      title: "12. Contact Us",
      content:
        "If you have questions about these Terms of Service, please contact us at:\n\nsupport@archeon.app",
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
          Terms of Service
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
        <View className="mb-6">
          <Text className="text-base text-gray-700 dark:text-gray-300 leading-6">
            Welcome to Archeon! These Terms of Service govern your use of our
            document management application. Please read them carefully.
          </Text>
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
