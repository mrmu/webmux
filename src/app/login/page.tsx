"use client";

import { useState, useEffect, FormEvent } from "react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [projectsRoot, setProjectsRoot] = useState("/var/docker-www/wp-proxy-sites");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((auth) => {
        if (auth.authenticated) {
          window.location.href = "/projects";
          return;
        }
        setIsFirstUser(!auth.hasUsers);
        setLoading(false);
      })
      .catch(() => {
        setIsFirstUser(false);
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isFirstUser) {
        await api.post("/api/auth/register", { email, password, name, projectsRoot });
      } else {
        await api.post("/api/auth/login", { email, password });
      }
      window.location.href = "/projects";
    } catch (err) {
      const msg = (err as Error).message;
      try { setError(JSON.parse(msg).error); } catch { setError(msg); }
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="screen">
        <div className="login-container">
          <div className="logo">
            <img src="/logo-robot.png" alt="" className="logo-icon" />
            <img src="/logo-text.png" alt="comux" className="logo-wordmark" />
          </div>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="login-container">
        <div className="logo">
            <img src="/logo-robot.png" alt="" className="logo-icon" />
            <img src="/logo-text.png" alt="comux" className="logo-wordmark" />
          </div>
        <p className="login-subtitle">
          {isFirstUser ? "Create admin account" : "Sign in to continue"}
        </p>
        <form className="login-form" onSubmit={handleSubmit}>
          {isFirstUser && (
            <input type="text" placeholder="Name" value={name}
              onChange={(e) => setName(e.target.value)} autoComplete="name" />
          )}
          <input type="email" placeholder="Email" required value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <input type="password" placeholder="Password" required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={isFirstUser ? "new-password" : "current-password"} />
          {isFirstUser && (
            <input type="text" placeholder="Projects directory"
              value={projectsRoot} onChange={(e) => setProjectsRoot(e.target.value)} required />
          )}
          <button type="submit" disabled={loading}>
            {isFirstUser ? "Create Account" : "Sign In"}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
