"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { ISSUE_SEVERITIES } from "@/lib/issues";

interface Project {
  name: string;
  display_name: string;
}

function NewIssuePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState(
    searchParams.get("project") || ""
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [assignedTo, setAssignedTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const list: Project[] = await api.get("/api/sessions");
        setProjects(list);
        if (!projectName && list.length > 0) setProjectName(list[0].name);
      } catch {
        setProjects([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError("");
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!projectName) {
      setError("Project is required");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.post("/api/issues", {
        project_name: projectName,
        title: title.trim(),
        body,
        severity,
        assigned_to: assignedTo.trim(),
      });
      router.replace(`/issues/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
      setSubmitting(false);
    }
  };

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="icon-btn" title="Back" onClick={() => router.back()}>
          &#x2190;
        </button>
        <h1 className="top-title">New Issue</h1>
      </header>

      <div className="account-content">
        <div className="form-row">
          <label>Project</label>
          <select
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary of the issue"
          />
        </div>

        <div className="form-row">
          <label>Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            {ISSUE_SEVERITIES.map((s) => (
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
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="email, or 'claude'"
          />
        </div>

        <div className="form-row">
          <label>Description</label>
          <textarea
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Details, reproduction steps, logs..."
          />
        </div>

        {error && <div className="error-text">{error}</div>}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            className="btn-secondary"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create Issue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewIssuePage() {
  return (
    <Suspense fallback={null}>
      <NewIssuePageContent />
    </Suspense>
  );
}
