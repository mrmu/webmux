"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  ISSUE_STATUSES,
  ISSUE_SEVERITIES,
  RESOLUTION_TYPES,
  isClosedStatus,
} from "@/lib/issues";

interface IssueEvent {
  id: number;
  actor: string;
  action: string;
  from_value: string;
  to_value: string;
  note: string;
  created_at: number;
}

interface IssueDetail {
  id: number;
  project_name: string;
  title: string;
  body: string;
  status: string;
  severity: string;
  source: string;
  source_ref: string;
  assigned_to: string;
  session_name: string;
  resolution_type: string;
  resolution_ref: string;
  resolution_note: string;
  resolved_by: string;
  resolved_at: number;
  created_by: string;
  created_at: number;
  updated_at: number;
  events: IssueEvent[];
}

function formatDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [closeStatus, setCloseStatus] = useState("FIXED");
  const [resolutionType, setResolutionType] = useState("COMMIT");
  const [resolutionRef, setResolutionRef] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const load = useCallback(async () => {
    try {
      setIssue(await api.get(`/api/issues/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (patch: Record<string, unknown>) => {
    setError("");
    try {
      await api.put(`/api/issues/${id}`, patch);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const submitClose = async () => {
    if (!resolutionRef && !resolutionNote) {
      setError("Reference or note is required when closing");
      return;
    }
    await update({
      status: closeStatus,
      resolution_type: resolutionType,
      resolution_ref: resolutionRef,
      resolution_note: resolutionNote,
    });
    setShowClose(false);
    setResolutionRef("");
    setResolutionNote("");
  };

  const reopen = () =>
    update({ status: "OPEN" });

  const addComment = async () => {
    const c = comment.trim();
    if (!c) return;
    setComment("");
    await update({ comment: c });
  };

  const del = async () => {
    if (!confirm("Delete this issue? It will be soft-deleted (kept in DB for audit).")) return;
    await api.del(`/api/issues/${id}`);
    router.push("/issues");
  };

  if (loading) {
    return (
      <div className="screen">
        <header className="top-bar">
          <button className="icon-btn" onClick={() => router.back()}>
            &#x2190;
          </button>
          <h1 className="top-title">Loading...</h1>
        </header>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="screen">
        <header className="top-bar">
          <button className="icon-btn" onClick={() => router.back()}>
            &#x2190;
          </button>
          <h1 className="top-title">Not found</h1>
        </header>
        <div className="empty-state">
          <p>{error || "Issue not found"}</p>
        </div>
      </div>
    );
  }

  const closed = isClosedStatus(issue.status);

  return (
    <div className="screen">
      <header className="top-bar">
        <button
          className="icon-btn"
          title="Back"
          onClick={() => router.push("/issues")}
        >
          &#x2190;
        </button>
        <h1 className="top-title">#{issue.id}</h1>
        <button className="icon-btn" title="Delete" onClick={del}>
          &#x2715;
        </button>
      </header>

      <div className="account-content">
        <div>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            {issue.title}
          </h2>
          <div className="issue-badges">
            <span className={`severity-badge sev-${issue.severity.toLowerCase()}`}>
              {issue.severity}
            </span>
            <span
              className={`status-badge status-${issue.status.toLowerCase()}${closed ? " status-closed" : ""}`}
            >
              {issue.status.replace("_", " ")}
            </span>
            <span className="issue-meta-project">{issue.project_name}</span>
          </div>
        </div>

        {issue.body && (
          <div className="issue-body">{issue.body}</div>
        )}

        <div className="account-section">
          <h3>Fields</h3>
          <div className="form-row">
            <label>Severity</label>
            <select
              value={issue.severity}
              onChange={(e) => update({ severity: e.target.value })}
            >
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Status</label>
            <select
              value={issue.status}
              onChange={(e) => {
                const next = e.target.value;
                if (!closed && isClosedStatus(next)) {
                  setCloseStatus(next);
                  setShowClose(true);
                } else if (closed && !isClosedStatus(next)) {
                  update({ status: next });
                } else {
                  update({ status: next });
                }
              }}
            >
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Assigned to</label>
            <input
              type="text"
              defaultValue={issue.assigned_to}
              placeholder="email, or 'claude'"
              onBlur={(e) => {
                if (e.target.value !== issue.assigned_to) {
                  update({ assigned_to: e.target.value });
                }
              }}
            />
          </div>
          <div className="form-row">
            <label>tmux session</label>
            <input
              type="text"
              defaultValue={issue.session_name}
              placeholder="(none)"
              onBlur={(e) => {
                if (e.target.value !== issue.session_name) {
                  update({ session_name: e.target.value });
                }
              }}
            />
          </div>
        </div>

        {closed && (
          <div className="account-section">
            <h3>Resolution</h3>
            <div className="issue-meta">Type: {issue.resolution_type}</div>
            {issue.resolution_ref && (
              <div className="issue-meta">Ref: {issue.resolution_ref}</div>
            )}
            {issue.resolution_note && (
              <div className="issue-meta">Note: {issue.resolution_note}</div>
            )}
            <div className="issue-meta">
              Closed by {issue.resolved_by} at {formatDate(issue.resolved_at)}
            </div>
            <button
              className="btn-secondary"
              style={{ marginTop: "0.5rem" }}
              onClick={reopen}
            >
              Reopen
            </button>
          </div>
        )}

        {showClose && (
          <div className="account-section" style={{ borderColor: "var(--accent)" }}>
            <h3>Close as {closeStatus.replace("_", " ")}</h3>
            <div className="form-row">
              <label>Resolution type</label>
              <select
                value={resolutionType}
                onChange={(e) => setResolutionType(e.target.value)}
              >
                {RESOLUTION_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Reference (commit hash, PR URL, ticket...)</label>
              <input
                type="text"
                value={resolutionRef}
                onChange={(e) => setResolutionRef(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Note (reason, risk acceptance justification...)</label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowClose(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={submitClose}>
                Confirm close
              </button>
            </div>
          </div>
        )}

        <div className="account-section">
          <h3>Timeline</h3>
          <div className="issue-timeline">
            {issue.events.map((e) => (
              <div key={e.id} className="issue-event">
                <div className="issue-event-head">
                  <strong>{e.actor || "system"}</strong>
                  <span> {renderAction(e)} </span>
                  <span className="issue-event-time">{formatDate(e.created_at)}</span>
                </div>
                {e.note && <div className="issue-event-note">{e.note}</div>}
              </div>
            ))}
          </div>
          <div className="form-row" style={{ marginTop: "0.75rem" }}>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-sm" onClick={addComment} disabled={!comment.trim()}>
              Add comment
            </button>
          </div>
        </div>

        {error && !showClose && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}

function renderAction(e: IssueEvent): string {
  switch (e.action) {
    case "created":
      return "created this issue";
    case "status_changed":
      return `changed status: ${e.from_value} → ${e.to_value}`;
    case "severity_changed":
      return `changed severity: ${e.from_value} → ${e.to_value}`;
    case "assigned":
      return e.to_value
        ? `assigned to ${e.to_value}`
        : `unassigned (was ${e.from_value})`;
    case "commented":
      return "commented";
    case "reopened":
      return "reopened";
    case "deleted":
      return "deleted";
    default:
      return e.action;
  }
}
