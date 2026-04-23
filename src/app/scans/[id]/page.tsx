"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Finding {
  id: number;
  rule_id: string;
  severity: string;
  cwe: string;
  owasp: string;
  cvss: number | null;
  file_path: string;
  line: number;
  end_line: number;
  message: string;
  fingerprint: string;
  fixed: boolean;
  first_seen_at: number;
  last_seen_at: number;
  issue_id: number | null;
}

interface ScanDetail {
  id: number;
  project_name: string;
  tool: string;
  tool_version: string;
  ruleset_ref: string;
  commit_sha: string;
  status: string;
  error_message: string;
  started_at: number;
  finished_at: number;
  sarif_path: string;
  summary: { CRITICAL?: number; HIGH?: number; MEDIUM?: number; LOW?: number; INFO?: number };
  findings: Finding[];
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

function formatTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

function formatDuration(start: number, end: number): string {
  if (!start || !end) return "";
  const s = end - start;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ruleShortName(ruleId: string): string {
  return ruleId.split(".").pop() || ruleId;
}

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<number>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState("");
  const [promoteMessage, setPromoteMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setScan(await api.get(`/api/scans/${id}`));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-poll while scan is RUNNING
  useEffect(() => {
    if (scan?.status !== "RUNNING") return;
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [scan?.status, load]);

  const toggleExpanded = (fid: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };

  const toggleFinding = (fid: number) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };

  const promoteSelected = async () => {
    if (!scan || selectedFindingIds.size === 0) return;
    setPromoting(true);
    setPromoteError("");
    setPromoteMessage("");
    try {
      const res: {
        created: Array<{ finding_id: number; issue_id: number }>;
        skipped: Array<{ finding_id: number; reason: string; issue_id?: number }>;
      } = await api.post(`/api/scans/${scan.id}/issues`, {
        finding_ids: Array.from(selectedFindingIds),
      });

      const issueByFinding = new Map(res.created.map((r) => [r.finding_id, r.issue_id]));
      for (const skipped of res.skipped) {
        if (skipped.issue_id) issueByFinding.set(skipped.finding_id, skipped.issue_id);
      }

      setScan((prev) =>
        prev
          ? {
              ...prev,
              findings: prev.findings.map((f) => {
                const issueId = issueByFinding.get(f.id);
                return issueId ? { ...f, issue_id: issueId } : f;
              }),
            }
          : prev
      );
      setSelectedFindingIds(new Set());
      setPromoteMessage(
        res.created.length > 0
          ? `已建立 ${res.created.length} 筆 issue`
          : "所選 finding 都已建立 issue 或不可加入"
      );
    } catch (e) {
      setPromoteError(e instanceof Error ? e.message : "建立 issue 失敗");
    } finally {
      setPromoting(false);
    }
  };

  if (loading) {
    return (
      <div className="screen">
        <header className="top-bar">
          <button className="icon-btn" onClick={() => router.back()}>
            &#x2190;
          </button>
          <h1 className="top-title">Loading…</h1>
        </header>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="screen">
        <header className="top-bar">
          <button className="icon-btn" onClick={() => router.back()}>
            &#x2190;
          </button>
          <h1 className="top-title">Not found</h1>
        </header>
      </div>
    );
  }

  const summary = scan.summary || {};
  const filtered = scan.findings.filter(
    (f) => severityFilter === "ALL" || f.severity === severityFilter
  );
  const promotableFiltered = filtered.filter((f) => !f.fixed && !f.issue_id);
  const selectedVisibleCount = promotableFiltered.filter((f) =>
    selectedFindingIds.has(f.id)
  ).length;
  const allVisibleSelected =
    promotableFiltered.length > 0 && selectedVisibleCount === promotableFiltered.length;
  const toggleAllVisible = () => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const f of promotableFiltered) next.delete(f.id);
      } else {
        for (const f of promotableFiltered) next.add(f.id);
      }
      return next;
    });
  };
  const groupedBySeverity: Record<string, Finding[]> = {};
  for (const sev of SEVERITY_ORDER) groupedBySeverity[sev] = [];
  for (const f of filtered) {
    if (groupedBySeverity[f.severity]) groupedBySeverity[f.severity].push(f);
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button
          className="icon-btn"
          title="Back"
          onClick={() => router.push(`/scans?project=${scan.project_name}`)}
        >
          &#x2190;
        </button>
        <h1 className="top-title">Scan #{scan.id}</h1>
      </header>

      <div className="account-content">
        <div>
          <div style={{ fontSize: "0.82rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            <strong>{scan.tool}</strong>
            {scan.tool_version && ` v${scan.tool_version}`}
            {" · "}
            <span style={{ fontFamily: "SF Mono, monospace" }}>{scan.ruleset_ref}</span>
            {scan.commit_sha && (
              <>
                {" · "}
                <span style={{ fontFamily: "SF Mono, monospace" }}>
                  @{scan.commit_sha.slice(0, 7)}
                </span>
              </>
            )}
          </div>
          <div className="issue-badges" style={{ marginBottom: "0.5rem" }}>
            {scan.status === "RUNNING" && (
              <span className="status-badge status-open">RUNNING</span>
            )}
            {scan.status === "SUCCESS" && (
              <span className="status-badge status-fixed">SUCCESS</span>
            )}
            {scan.status === "FAILED" && (
              <span className="severity-badge sev-high">FAILED</span>
            )}
            {SEVERITY_ORDER.map((sev) => {
              const n = (summary[sev as keyof typeof summary] as number) || 0;
              if (n === 0) return null;
              return (
                <span key={sev} className={`severity-badge sev-${sev.toLowerCase()}`}>
                  {n} {sev}
                </span>
              );
            })}
          </div>
          <div className="issue-meta">
            {formatTime(scan.started_at)}
            {scan.finished_at > 0 && ` · ${formatDuration(scan.started_at, scan.finished_at)}`}
            {" · "}project: <span style={{ fontFamily: "SF Mono, monospace" }}>{scan.project_name}</span>
          </div>
        </div>

        {scan.error_message && (
          <div className="chat-send-error">{scan.error_message}</div>
        )}

        {promoteError && <div className="chat-send-error">{promoteError}</div>}
        {promoteMessage && <div className="scan-promote-message">{promoteMessage}</div>}

        {scan.status === "SUCCESS" && scan.findings.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">✓</div>
            <p>No findings. Clean scan.</p>
          </div>
        )}

        {scan.findings.length > 0 && (
          <>
            <div className="scan-actions">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <option value="ALL">All severities ({scan.findings.length})</option>
                {SEVERITY_ORDER.map((sev) => {
                  const n = scan.findings.filter((f) => f.severity === sev).length;
                  if (n === 0) return null;
                  return (
                    <option key={sev} value={sev}>
                      {sev} ({n})
                    </option>
                  );
                })}
              </select>
              <button
                className="btn-secondary scan-action-btn"
                onClick={toggleAllVisible}
                disabled={promoting || promotableFiltered.length === 0}
              >
                {allVisibleSelected ? "取消勾選" : "勾選可加入項目"}
              </button>
              <button
                className="btn-primary scan-action-btn"
                onClick={promoteSelected}
                disabled={promoting || selectedFindingIds.size === 0}
              >
                {promoting ? "建立中..." : `加入 Issues (${selectedFindingIds.size})`}
              </button>
            </div>

            <div className="finding-list">
              {SEVERITY_ORDER.map((sev) => {
                const list = groupedBySeverity[sev];
                if (list.length === 0) return null;
                return (
                  <div key={sev} className="finding-group">
                    <h3 className="finding-group-title">
                      <span className={`severity-badge sev-${sev.toLowerCase()}`}>{sev}</span>
                      <span style={{ marginLeft: "0.5rem", color: "var(--text-dim)" }}>
                        {list.length}
                      </span>
                    </h3>
                    {list.map((f) => {
                      const isExpanded = expanded.has(f.id);
                      return (
                        <div
                          key={f.id}
                          className={`finding-card${f.fixed ? " fixed" : ""}`}
                        >
                          <div
                            className="finding-card-head"
                            onClick={() => toggleExpanded(f.id)}
                          >
                            <div className="finding-card-title">
                              <input
                                type="checkbox"
                                className="finding-checkbox"
                                checked={selectedFindingIds.has(f.id)}
                                disabled={f.fixed || Boolean(f.issue_id)}
                                title={f.issue_id ? "已建立 issue" : "選取加入 Issues"}
                                onChange={() => toggleFinding(f.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span className="finding-rule">{ruleShortName(f.rule_id)}</span>
                              <span className="finding-loc">
                                {f.file_path}:{f.line}
                              </span>
                            </div>
                            <div className="finding-card-message">{f.message}</div>
                            {f.issue_id && (
                              <button
                                className="finding-issue-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/issues/${f.issue_id}`);
                                }}
                              >
                                Issue #{f.issue_id}
                              </button>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="finding-card-body">
                              <div className="finding-meta-row">
                                <span>
                                  <strong>Rule:</strong>{" "}
                                  <code>{f.rule_id}</code>
                                </span>
                              </div>
                              {f.cwe && (
                                <div className="finding-meta-row">
                                  <span>
                                    <strong>CWE:</strong> {f.cwe}
                                  </span>
                                </div>
                              )}
                              {f.owasp && (
                                <div className="finding-meta-row">
                                  <span>
                                    <strong>OWASP:</strong> {f.owasp}
                                  </span>
                                </div>
                              )}
                              {f.cvss !== null && (
                                <div className="finding-meta-row">
                                  <span>
                                    <strong>CVSS:</strong> {f.cvss}
                                  </span>
                                </div>
                              )}
                              <div className="finding-meta-row">
                                <span>
                                  <strong>First seen:</strong>{" "}
                                  {formatTime(f.first_seen_at)}
                                </span>
                              </div>
                              <div className="finding-meta-row">
                                <span>
                                  <strong>Last seen:</strong>{" "}
                                  {formatTime(f.last_seen_at)}
                                </span>
                              </div>
                              <div className="finding-meta-row">
                                <span>
                                  <strong>Fingerprint:</strong>{" "}
                                  <code>{f.fingerprint}</code>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
