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
/** Heuristically take the first 2-3 sentences from note content for a
 *  reasonable default issue title — users can still edit before confirming.
 *  Chinese notes tend to be long run-on paragraphs with commas but few
 *  periods, so if the first fragment already blows past the budget we
 *  fall back to cutting at the latest comma that still looks natural. */
function suggestTitle(text: string, maxChars = 100): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "";
  // ASCII `.!?` only count as a terminator when followed by whitespace —
  // otherwise "produces .comux/*.md" becomes three "sentences". CJK
  // terminators (。！？) are unambiguous and split regardless.
  const parts = clean
    .split(/(?:(?<=[.!?])\s+|(?<=[。！？])\s*)/)
    .filter((p) => p.trim());
  let out = "";
  for (const p of parts.slice(0, 3)) {
    const next = out ? `${out} ${p}` : p;
    if (next.length > maxChars) {
      if (!out) {
        const slice = p.slice(0, maxChars);
        const commaIdx = Math.max(
          slice.lastIndexOf("，"),
          slice.lastIndexOf("、"),
          slice.lastIndexOf(", "),
        );
        // Only use the comma cut if it falls past the halfway mark — keeps
        // us from returning a ridiculously short title.
        out = commaIdx > maxChars * 0.5 ? p.slice(0, commaIdx).trim() : slice.trim();
      }
      break;
    }
    out = next;
  }
  return (out || clean.slice(0, maxChars)).trim();
}

export default function IssuePicker({
  projectName,
  noteId,
  noteContent,
  onLinked,
  onClose,
}: {
  projectName: string;
  noteId: number;
  noteContent: string;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // 'create' | `link:${id}`
  const [creating, setCreating] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

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

  const startCreate = () => {
    setTitleDraft(suggestTitle(noteContent));
    setCreating(true);
    // Focus the title input after React has rendered it.
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  const submitCreate = async () => {
    const title = titleDraft.trim();
    if (!title) return;
    setBusy("create");
    try {
      await api.post(`/api/notes/${noteId}/promote`, { title });
      onLinked();
      onClose();
    } catch { /* ignore */ }
    setBusy(null);
  };

  return (
    <div className="issue-picker" ref={rootRef}>
      {creating ? (
        <div className="issue-picker-create-form">
          <label className="issue-picker-create-label">Issue title</label>
          <input
            ref={titleInputRef}
            type="text"
            className="issue-picker-search"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setCreating(false);
              if (e.key === "Enter" && titleDraft.trim()) submitCreate();
            }}
            placeholder="Short summary of what this issue is about"
            maxLength={200}
          />
          <p className="settings-hint" style={{ margin: "0.4rem 0.65rem 0" }}>
            The note will be attached to the new issue. Body stays empty —
            you can add a longer description on the issue page later.
          </p>
          <div className="issue-picker-create-actions">
            <button
              onClick={() => setCreating(false)}
              disabled={busy !== null}
              className="issue-picker-btn secondary"
            >
              Cancel
            </button>
            <button
              onClick={submitCreate}
              disabled={busy !== null || !titleDraft.trim()}
              className="issue-picker-btn primary"
            >
              {busy === "create" ? "Creating…" : "Create issue"}
            </button>
          </div>
        </div>
      ) : (
        <>
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
            onClick={startCreate}
            disabled={busy !== null}
          >
            <CirclePlusIcon />
            <span>Create new issue from this note</span>
          </button>
        </>
      )}
    </div>
  );
}
