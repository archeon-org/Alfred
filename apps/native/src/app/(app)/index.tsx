import React, { useCallback } from "react";
import { ScrollView, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser } from "../../hooks/useUser";
import {
  useRecentDocuments,
  usePendingManualDocuments,
} from "../../hooks/useDocuments";
import { useCategories } from "../../hooks/useCategories";
import { HomeHeader } from "../../components/home/HomeHeader";
import { StorageWidget } from "../../components/home/StorageWidget";
import { QuickActions } from "../../components/home/QuickActions";
import { RecentDocuments } from "../../components/home/RecentDocuments";
import { PendingManualDocuments } from "../../components/home/PendingManualDocuments";
import { CategoryList } from "../../components/home/CategoryList";

export default function HomeScreen() {
  const { data: user, refetch: refetchUser } = useUser();
  const {
    data: recentDocs,
    isLoading: isLoadingDocs,
    refetch: refetchDocs,
  } = useRecentDocuments(3);
  const {
    data: pendingDocs,
    isLoading: isLoadingPending,
    refetch: refetchPending,
  } = usePendingManualDocuments(3);
  const {
    categories,
    isLoading: isLoadingCategories,
    refetch: refetchCategories,
  } = useCategories();

  const onRefresh = useCallback(() => {
    refetchUser();
    refetchDocs();
    refetchPending();
    refetchCategories();
  }, []);

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
          used={user?.storageUsed || 0}
          limit={user?.storageLimit || 2147483648}
        />

        {/* 
           If this returns null, the gap-y-6 in contentContainer 
           simply closes the space between StorageWidget and QuickActions. 
           No overlap will occur.
        */}
        <PendingManualDocuments
          documents={
            isLoadingPending
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
              : pendingDocs?.data || []
          }
          isLoading={false}
        />

        <QuickActions />

        <CategoryList categories={categories} isLoading={isLoadingCategories} />

        <RecentDocuments
          documents={recentDocs || []}
          isLoading={isLoadingDocs}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
