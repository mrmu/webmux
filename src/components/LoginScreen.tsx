"use client";

import { useState, FormEvent } from "react";
import { api } from "@/lib/api";

export default function LoginScreen({
  onSuccess,
  isFirstUser,
}: {
  onSuccess: () => void;
  isFirstUser: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isFirstUser) {
        await api.post("/api/auth/register", { email, password, name });
      } else {
        await api.post("/api/auth/login", { email, password });
      }
      onSuccess();
    } catch (err) {
      const msg = (err as Error).message;
      try {
        setError(JSON.parse(msg).error);
      } catch {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen">
      <div className="login-container">
        <h1 className="logo">webmux</h1>
        <p className="login-subtitle">
          {isFirstUser ? "Create admin account" : "Sign in to continue"}
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          {isFirstUser && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isFirstUser ? "new-password" : "current-password"}
          />
          <button type="submit" disabled={loading}>
            {loading ? "..." : isFirstUser ? "Create Account" : "Sign In"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
