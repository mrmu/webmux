export const ISSUE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "FIXED",
  "WONT_FIX",
  "FALSE_POSITIVE",
  "RISK_ACCEPTED",
] as const;

export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const ISSUE_SOURCES = ["MANUAL", "SCAN", "EXTERNAL_SYNC"] as const;

export const RESOLUTION_TYPES = [
  "COMMIT",
  "PR",
  "EXTERNAL",
  "ACCEPTED_RISK",
  "NOT_APPLICABLE",
] as const;

// Statuses that mean the issue is resolved/closed. Transitioning into one of
// these requires a resolutionType — that requirement is what makes the log
// usable as ISO 27001 audit evidence.
export const CLOSED_STATUSES: readonly string[] = [
  "FIXED",
  "WONT_FIX",
  "FALSE_POSITIVE",
  "RISK_ACCEPTED",
];

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type IssueSource = (typeof ISSUE_SOURCES)[number];
export type ResolutionType = (typeof RESOLUTION_TYPES)[number];

export function isClosedStatus(s: string): boolean {
  return CLOSED_STATUSES.includes(s);
}
