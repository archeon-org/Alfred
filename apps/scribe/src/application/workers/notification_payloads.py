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


def build_graphiti_success_notification(
    user_id: str,
    document_id: str,
    document_name: str,
    node_count: int,
    edge_count: int,
    graphiti_disabled: bool,
) -> CreateNotificationDTO:
    if graphiti_disabled:
        message = f'"{document_name}" has been processed and classified.'
    else:
        message = (
            f'"{document_name}" has been processed. Extracted '
            f"{node_count} entities and {edge_count} relationships."
        )
    return CreateNotificationDTO(
        user_id=user_id,
        title="Document Processed",
        message=message,
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.DOCUMENT_CLASSIFIED,
        data={
            "documentId": document_id,
            "nodeCount": node_count,
            "edgeCount": edge_count,
        },
    )


def build_graphiti_failure_notification(
    user_id: str,
    document_id: str,
    document_name: str,
    error_message: str | None,
) -> CreateNotificationDTO:
    message = f'"{document_name}" was classified but knowledge graph sync encountered an issue.'
    if error_message:
        message = f"{message} ({error_message})"
    return CreateNotificationDTO(
        user_id=user_id,
        title="Document Processing Issue",
        message=message,
        redirect=f"/(app)/documents/{document_id}",
        notification_type=NotificationType.DOCUMENT_ERROR,
        data={"documentId": document_id},
    )
