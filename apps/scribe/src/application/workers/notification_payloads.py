from services.notification import CreateNotificationDTO, NotificationType


def build_title_generated_notification(
    user_id: str,
    document_id: str,
    title: str,
) -> CreateNotificationDTO:
    return CreateNotificationDTO(
        user_id=user_id,
        title="Title Generated",
        message=f'Your document has been renamed to "{title}".',
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.TITLE_GENERATED,
        data={"documentId": document_id},
    )


def build_document_processing_failed_notification(
    user_id: str,
    document_id: str,
) -> CreateNotificationDTO:
    return CreateNotificationDTO(
        user_id=user_id,
        title="Document Processing Failed",
        message="There was an error processing your document. Your credits have been refunded.",
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.DOCUMENT_ERROR,
        data={"documentId": document_id},
    )


def build_title_failed_notification(
    user_id: str,
    document_id: str,
) -> CreateNotificationDTO:
    return CreateNotificationDTO(
        user_id=user_id,
        title="Title Generation Failed",
        message="There was an error generating a title. Your credits have been refunded.",
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.DOCUMENT_ERROR,
        data={"documentId": document_id},
    )


def build_document_indexed_notification(
    user_id: str,
    document_id: str,
    chunk_count: int,
) -> CreateNotificationDTO:
    return CreateNotificationDTO(
        user_id=user_id,
        title="Search Enabled",
        message=f"Your document has been indexed into {chunk_count} chunks for AI search.",
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.SEARCH_ENABLED,
        data={"documentId": document_id, "chunkCount": chunk_count},
    )


def build_document_index_failed_notification(
    user_id: str,
    document_id: str,
    refunded: bool,
) -> CreateNotificationDTO:
    message = "There was an error enabling search for this document."
    if refunded:
        message += " Your embedding credits have been refunded."
    return CreateNotificationDTO(
        user_id=user_id,
        title="Search Indexing Failed",
        message=message,
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.DOCUMENT_ERROR,
        data={"documentId": document_id},
    )


def build_bulk_processing_summary_notification(
    user_id: str,
    total: int,
    succeeded: int,
    failed: int,
    bulk_operation_id: str | None = None,
) -> CreateNotificationDTO:
    return CreateNotificationDTO(
        user_id=user_id,
        title="Bulk Processing Complete",
        message=(
            f"Processed {total} documents: {succeeded} succeeded, {failed} failed. "
            "Search indexing has been queued for successful documents."
        ),
        redirect="/(app)/documents",
        notification_type=NotificationType.DOCUMENT_CLASSIFIED,
        data={
            "bulkOperationId": bulk_operation_id,
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
        },
    )
