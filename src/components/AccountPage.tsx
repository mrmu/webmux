"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { api } from "@/lib/api";

interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

export default function AccountPage({
  currentEmail,
  onBack,
  onLogout,
}: {
  currentEmail: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  // Add user
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newUserPw, setNewUserPw] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api.get("/api/auth/users"));
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg("");
    setPwSaving(true);
    try {
      await api.put("/api/auth/password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      setPwMsg("Password updated");
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      const msg = (err as Error).message;
      try { setPwMsg(JSON.parse(msg).error); } catch { setPwMsg(msg); }
    }
    setPwSaving(false);
  };

  const addUser = async (e: FormEvent) => {
    e.preventDefault();
    setAddMsg("");
    try {
      await api.post("/api/auth/users", {
        email: newEmail,
        password: newUserPw,
        name: newName,
      });
      setNewEmail("");
      setNewName("");
      setNewUserPw("");
      setAddMsg("User created");
      loadUsers();
    } catch (err) {
      const msg = (err as Error).message;
      try { setAddMsg(JSON.parse(msg).error); } catch { setAddMsg(msg); }
    }
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    try {
      await api.del(`/api/auth/users/${id}`);
      loadUsers();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const logout = async () => {
    await api.post("/api/auth/logout", {});
    onLogout();
  };

  return (
    <div className="screen">
      <header className="top-bar">
        <button className="icon-btn back-btn" onClick={onBack}>&larr;</button>
        <h1 className="top-title">Account</h1>
        <button className="icon-btn" onClick={logout} title="Logout" style={{ fontSize: "0.9rem" }}>
          Logout
        </button>
      </header>

      <div className="account-content">
        {/* Change Password */}
        <section className="settings-section">
          <h3>Change Password</h3>
          <form onSubmit={changePassword}>
            <label>
              Current Password
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
            </label>
            <label>
              New Password
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6} />
            </label>
            <button className="btn-primary" type="submit" disabled={pwSaving}
              style={{ marginTop: "0.5rem", padding: "0.5rem 1.5rem" }}>
              {pwSaving ? "Saving..." : "Update Password"}
            </button>
            {pwMsg && <p className={`settings-hint ${pwMsg.includes("updated") ? "success-text" : "error-text"}`}>{pwMsg}</p>}
          </form>
        </section>

        {/* User Management */}
        <section className="settings-section">
          <h3>Users</h3>
          <div className="user-list">
            {users.map((u) => (
              <div key={u.id} className="user-item">
                <div className="user-info">
                  <span className="user-email">{u.email}</span>
                  {u.name && <span className="user-name">{u.name}</span>}
                </div>
                {u.email === currentEmail ? (
                  <span className="user-badge">you</span>
                ) : (
                  <button className="host-delete" onClick={() => deleteUser(u.id, u.email)}>&times;</button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Add User */}
        <section className="settings-section">
          <h3>Add User</h3>
          <form onSubmit={addUser}>
            <label>
              Email
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
            </label>
            <label>
              Name
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={newUserPw} onChange={(e) => setNewUserPw(e.target.value)} required minLength={6} />
            </label>
            <button className="btn-primary" type="submit"
              style={{ marginTop: "0.5rem", padding: "0.5rem 1.5rem" }}>
              Add User
            </button>
            {addMsg && <p className={`settings-hint ${addMsg.includes("created") ? "success-text" : "error-text"}`}>{addMsg}</p>}
          </form>
        </section>
      </div>
    </div>
  );
}
