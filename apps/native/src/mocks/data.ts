import { Category, Document } from "@archeon-org/types";

export const MOCK_DOCUMENTS: Document[] = [
  {
    id: "1",
    title: "Insurance Policy 2025",
    originalName: "insurance_policy.pdf",
    mimetype: "application/pdf",
    size: 2450000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    updatedAt: new Date(),
    userId: "user1",
    categoryId: "cat1",
    filename: "insurance_policy.pdf",
    path: "/docs/insurance_policy.pdf",
    isProcessed: true,
    processingStatus: "COMPLETED" as any,
  },
  {
    id: "2",
    title: "Car Rental Agreement",
    originalName: "rental_agreement_signed.pdf",
    mimetype: "application/pdf",
    size: 1200000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    updatedAt: new Date(),
    userId: "user1",
    categoryId: "cat2",
    filename: "rental_agreement_signed.pdf",
    path: "/docs/rental_agreement_signed.pdf",
    isProcessed: true,
    processingStatus: "COMPLETED" as any,
  },
  {
    id: "3",
    title: "Passport Scan",
    originalName: "passport.jpg",
    mimetype: "image/jpeg",
    size: 3500000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48), // 2 days ago
    updatedAt: new Date(),
    userId: "user1",
    categoryId: "cat3",
    filename: "passport.jpg",
    path: "/docs/passport.jpg",
    isProcessed: true,
    processingStatus: "COMPLETED" as any,
  },
  {
    id: "4",
    title: "Electricity Bill - Oct",
    originalName: "bill_oct_2025.pdf",
    mimetype: "application/pdf",
    size: 850000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
    updatedAt: new Date(),
    userId: "user1",
    categoryId: "cat4",
    filename: "bill_oct_2025.pdf",
    path: "/docs/bill_oct_2025.pdf",
    isProcessed: true,
    processingStatus: "COMPLETED" as any,
  },
  {
    id: "5",
    title: "Medical Report",
    originalName: "blood_test_results.pdf",
    mimetype: "application/pdf",
    size: 1500000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 1 week ago
    updatedAt: new Date(),
    userId: "user1",
    categoryId: "cat5",
    filename: "blood_test_results.pdf",
    path: "/docs/blood_test_results.pdf",
    isProcessed: true,
    processingStatus: "COMPLETED" as any,
  },
];

export const MOCK_PENDING_DOCUMENTS: Document[] = [
  {
    id: "p1",
    title: "Unknown Receipt",
    originalName: "scan_2025_11_25.jpg",
    mimetype: "image/jpeg",
    size: 2100000,
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    updatedAt: new Date(),
    userId: "user1",
    filename: "scan_2025_11_25.jpg",
    path: "/docs/scan_2025_11_25.jpg",
    isProcessed: false,
    processingStatus: "PENDING" as any,
  },
  {
    id: "p2",
    title: "Untitled Document",
    originalName: "doc_scan_v2.pdf",
    mimetype: "application/pdf",
    size: 1800000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
    updatedAt: new Date(),
    userId: "user1",
    filename: "doc_scan_v2.pdf",
    path: "/docs/doc_scan_v2.pdf",
    isProcessed: false,
    processingStatus: "PENDING" as any,
  },
];

export const MOCK_CATEGORIES: Category[] = [
  {
    id: "cat1",
    name: "Finance",
    icon: "cash-outline",
    color: "#10B981", // Emerald 500
    userId: "user1",
    isSystemDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "cat2",
    name: "Legal",
    icon: "briefcase-outline",
    color: "#6366F1", // Indigo 500
    userId: "user1",
    isSystemDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "cat3",
    name: "Personal",
    icon: "person-outline",
    color: "#F59E0B", // Amber 500
    userId: "user1",
    isSystemDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "cat4",
    name: "Health",
    icon: "medical-outline",
    color: "#EF4444", // Red 500
    userId: "user1",
    isSystemDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "cat5",
    name: "Education",
    icon: "school-outline",
    color: "#8B5CF6", // Violet 500
    userId: "user1",
    isSystemDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "cat6",
    name: "Travel",
    icon: "airplane-outline",
    color: "#0EA5E9", // Sky 500
    userId: "user1",
    isSystemDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
