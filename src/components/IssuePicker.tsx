"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { CirclePlusIcon } from "./icons";

interface IssueSummary {
  id: number;
  title: string;
  status: string;
  severity: string;
}

/** Dropdown for attaching a Note to an Issue — either an existing open one
 *  or a freshly created one. Positions itself absolutely relative to the
 *  trigger element and closes on outside click / Esc. */
export default function IssuePicker({
  projectName,
  noteId,
  onLinked,
  onClose,
}: {
  projectName: string;
  noteId: number;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // 'create' | `link:${id}`
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      // Open = not in CLOSED_STATUSES and not soft-deleted (deletedAt=null is
      // default for the list endpoint). Two status params stack as OR.
      const data = await api.get(
        `/api/issues?project=${encodeURIComponent(projectName)}&status=OPEN&status=IN_PROGRESS`
      );
      setIssues(
        (data as Array<Record<string, unknown>>).map((d) => ({
          id: d.id as number,
          title: d.title as string,
          status: d.status as string,
          severity: d.severity as string,
        }))
      );
    } catch {
      setIssues([]);
    }
  }, [projectName]);

  useEffect(() => {
    load();
    inputRef.current?.focus();
  }, [load]);

  // Close on outside click / Esc
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtered = query
    ? issues.filter((i) =>
        (i.title.toLowerCase().includes(query.toLowerCase()) ||
          String(i.id).includes(query))
      )
    : issues;

  const linkTo = async (id: number) => {
    setBusy(`link:${id}`);
    try {
      await api.put(`/api/notes/${noteId}`, { issue_id: id });
      onLinked();
      onClose();
    } catch { /* ignore */ }
    setBusy(null);
  };

  const createNew = async () => {
    setBusy("create");
    try {
      await api.post(`/api/notes/${noteId}/promote`, {});
      onLinked();
      onClose();
    } catch { /* ignore */ }
    setBusy(null);
  };

  return (
    <div className="issue-picker" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        className="issue-picker-search"
        placeholder="Search open issues…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="issue-picker-list">
        {filtered.length === 0 ? (
          <p className="settings-hint" style={{ padding: "0.4rem 0.6rem", margin: 0 }}>
            {issues.length === 0 ? "No open issues in this project." : "No match."}
          </p>
        ) : (
          filtered.map((i) => (
            <button
              key={i.id}
              className="issue-picker-item"
              onClick={() => linkTo(i.id)}
              disabled={busy !== null}
            >
              <span className="issue-picker-id">#{i.id}</span>
              <span className="issue-picker-title">{i.title}</span>
              <span className={`issue-picker-status ${i.status.toLowerCase()}`}>
                {i.status.toLowerCase().replace("_", " ")}
              </span>
            </button>
          ))
        )}
      </div>
      <button
        className="issue-picker-create"
        onClick={createNew}
        disabled={busy !== null}
      >
        <CirclePlusIcon />
        <span>{busy === "create" ? "Creating…" : "Create new issue from this note"}</span>
      </button>
    </div>
  );
}
