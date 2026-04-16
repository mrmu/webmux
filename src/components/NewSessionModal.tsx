"use client";

import { useState, FormEvent } from "react";
import { api } from "@/lib/api";

const COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#ef4444", "#64748b",
];

export default function NewSessionModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [display, setDisplay] = useState("");
  const [cwd, setCwd] = useState("/home/dev/next/");
  const [command, setCommand] = useState("claude --dangerously-skip-permissions");
  const [color, setColor] = useState(COLORS[0]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/sessions", {
        name: name.trim(),
        display_name: display.trim() || name.trim(),
        cwd: cwd.trim() || null,
        command: command.trim() || null,
        color,
      });
      onCreated();
    } catch (err) {
      alert("Failed to create session: " + (err as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>New Project</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Project Name
            <input
              type="text"
              placeholder="my-project"
              required
              pattern="[a-zA-Z0-9_\-]+"
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                // Auto-fill cwd if user hasn't customized it
                if (cwd === "/home/dev/next/" || cwd === `/home/dev/next/${name}`) {
                  setCwd(v ? `/home/dev/next/${v}` : "/home/dev/next/");
                }
              }}
            />
          </label>
          <label>
            Display Name
            <input
              type="text"
              placeholder="My Project"
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
            />
          </label>
          <label>
            Working Directory
            <input
              type="text"
              placeholder="/home/dev/next/my-project"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            />
          </label>
          <label>
            Start Command (optional)
            <input
              type="text"
              placeholder="claude"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </label>
          <label>
            Color
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-dot${color === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
