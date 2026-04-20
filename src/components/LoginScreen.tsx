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
  const [mode, setMode] = useState<"login" | "register">(
    isFirstUser ? "register" : "login"
  );
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
      if (mode === "register") {
        await api.post("/api/auth/register", { email, password, name });
      } else {
        await api.post("/api/auth/login", { email, password });
      }
      onSuccess();
    } catch (err) {
      const msg = (err as Error).message;
      try {
        const parsed = JSON.parse(msg);
        setError(parsed.error || msg);
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
          {isFirstUser
            ? "Create your admin account"
            : mode === "login"
              ? "Sign in to continue"
              : "Create account"}
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          {mode === "register" && (
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
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
          <button type="submit" disabled={loading}>
            {loading
              ? "..."
              : mode === "register"
                ? "Create Account"
                : "Sign In"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
        {!isFirstUser && (
          <button
            className="auth-switch-btn"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "Need an account? Register"
              : "Already have an account? Sign in"}
          </button>
        )}
      </div>
    </div>
  );
}
