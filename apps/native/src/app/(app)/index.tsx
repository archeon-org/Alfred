import React, { useCallback, useState } from "react";
import { ScrollView, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "../../hooks/useUser";
import {
  useRecentDocuments,
  useActionRequiredDocuments,
} from "../../hooks/useDocuments";
import { useCategories } from "../../hooks/useCategories";
import { useNotifications } from "../../hooks/useNotifications";
import { HomeHeader } from "../../components/home/HomeHeader";
import { StorageWidget } from "../../components/home/StorageWidget";
import { QuickActions } from "../../components/home/QuickActions";
import { RecentDocuments } from "../../components/home/RecentDocuments";
import { ActionRequiredDocuments } from "../../components/home/ActionRequiredDocuments";
import { CategoryList } from "../../components/home/CategoryList";
import { AISearchBottomSheet } from "../../components/search/AISearchBottomSheet";
import { TipsSection } from "../../components/home/TipsSection";

export default function HomeScreen() {
  const { data: user, refetch: refetchUser } = useUser();
  const { refetch: refetchNotifications } = useNotifications();
  const [aiSearchVisible, setAiSearchVisible] = useState(false);
  const {
    data: recentDocs,
    isLoading: isLoadingDocs,
    refetch: refetchDocs,
  } = useRecentDocuments(3);
  const {
    data: actionRequiredDocs,
    isLoading: isLoadingActionRequired,
    refetch: refetchActionRequired,
  } = useActionRequiredDocuments(3);
  const {
    categories,
    isLoading: isLoadingCategories,
    refetch: refetchCategories,
  } = useCategories();

  const onRefresh = useCallback(() => {
    refetchUser();
    refetchDocs();
    refetchActionRequired();
    refetchCategories();
    refetchNotifications();
  }, [
    refetchUser,
    refetchDocs,
    refetchActionRequired,
    refetchCategories,
    refetchNotifications,
  ]);

  // Use subscription data for storage info (more accurate and includes extra storage)
  const storageUsed = user?.subscription?.storageUsed ?? user?.storageUsed ?? 0;
  const storageLimit =
    user?.subscription?.storageLimit ?? user?.storageLimit ?? 1073741824;
  const credits = user?.subscription?.credits;
  const dailySearchUsed = user?.subscription?.dailySearchUsed ?? 0;
  const dailySearchLimit = user?.subscription?.dailySearchLimit ?? 0;
  const bonusSearches = user?.subscription?.bonusSearches ?? 0;

  return (
    <SafeAreaView
      className="flex-1 bg-background dark:bg-background-dark"
      edges={["top"]}
    >
      <ScrollView
        className="flex-1"
        // FIX 1: Apply layout rules to the content container, not the ScrollView wrapper
        // FIX 2: 'gap-y-6' handles spacing automatically. No need to worry about margins collapsing.
        // FIX 3: 'pb-48' ensures the last item isn't hidden behind the home indicator and tab bar
        contentContainerClassName="px-6 pt-4 pb-18 flex-col gap-y-6"
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <HomeHeader user={user} />

        <StorageWidget
          used={storageUsed}
          limit={storageLimit}
          credits={credits}
          dailySearchUsed={dailySearchUsed}
          dailySearchLimit={dailySearchLimit}
          bonusSearches={bonusSearches}
        />

        {/* 
           If this returns null, the gap-y-6 in contentContainer 
           simply closes the space between StorageWidget and QuickActions. 
           No overlap will occur.
        */}
        <ActionRequiredDocuments
          documents={
            isLoadingActionRequired
              ? [
                  {
                    id: "loading",
                    title: "Loading...",
                    originalName: "Loading...",
                    mimetype: "application/pdf",
                    size: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    userId: "loading",
                    status: "PENDING",
                  } as any,
                ]
              : actionRequiredDocs?.data || []
          }
          isLoading={false}
        />

        <TipsSection preferences={user?.preferences} />

        <QuickActions onSearchPress={() => setAiSearchVisible(true)} />

        <CategoryList categories={categories} isLoading={isLoadingCategories} />

        <RecentDocuments
          documents={recentDocs || []}
          isLoading={isLoadingDocs}
        />
      </ScrollView>

      <AISearchBottomSheet
        visible={aiSearchVisible}
        onClose={() => setAiSearchVisible(false)}
      />
    </SafeAreaView>
  );
}
