import type { DescriptorMap } from "../primitives/descriptor";
import type { Timestamp } from "../primitives/temporal";

export type ReceiptCaptureReviewStatus = "pending_review" | "confirmed" | "rejected";

export const REVIEW_STATUSES: DescriptorMap<ReceiptCaptureReviewStatus> = {
  pending_review: { label: "Pending review", icon: "clock", tone: "warning" },
  confirmed: { label: "Confirmed", icon: "check-circle", tone: "success" },
  rejected: { label: "Rejected", icon: "x-circle", tone: "danger" },
};

// Loose by design: this is raw OCR/LLM output, never trusted until the user
// confirms it (PROJECT_BRIEF §8.3 edge #11). Fields are all optional and
// stringly-typed because the extraction step can misread or omit any of them.
export interface ParsedReceiptData {
  merchant?: string;
  amount?: number;
  date?: string;
  currency?: string;
  installmentInfo?: string;
}

export interface ReceiptCapture {
  id: string;
  imageRef: string;
  rawOcrText: string;
  parsedData?: ParsedReceiptData;
  reviewStatus: ReceiptCaptureReviewStatus;
  linkedPaymentItemId?: string;
  linkedOccurrenceId?: string;
  createdAt: Timestamp;
}
