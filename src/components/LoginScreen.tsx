"use client";

import { useState, FormEvent } from "react";
import { api } from "@/lib/api";

export default function LoginScreen({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/auth/login", { password });
      setError("");
      onSuccess();
    } catch {
      setError("Invalid password");
    }
  };

  return (
    <div className="screen">
      <div className="login-container">
        <h1 className="logo">webmux</h1>
        <p className="login-subtitle">Enter password to continue</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit">Login</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
