"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import LoginScreen from "@/components/LoginScreen";
import SessionList, { type SessionInfo } from "@/components/SessionList";
import Workspace from "@/components/Workspace";

type Screen =
  | { type: "loading" }
  | { type: "login"; isFirstUser: boolean }
  | { type: "list" }
  | { type: "workspace"; session: string; sessions: SessionInfo[] };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ type: "loading" });

  const checkAuth = async () => {
    try {
      const auth = await api.get("/api/auth/check");
      if (auth.authenticated) {
        setScreen({ type: "list" });
      } else {
        setScreen({ type: "login", isFirstUser: !auth.hasUsers });
      }
    } catch {
      setScreen({ type: "login", isFirstUser: false });
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (screen.type === "loading") {
    return (
      <div className="screen">
        <div className="login-container">
          <h1 className="logo">webmux</h1>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (screen.type === "login") {
    return (
      <LoginScreen
        onSuccess={() => setScreen({ type: "list" })}
        isFirstUser={screen.isFirstUser}
      />
    );
  }

  if (screen.type === "list") {
    return (
      <SessionList
        onOpenWorkspace={(name, sessions) =>
          setScreen({ type: "workspace", session: name, sessions })
        }
      />
    );
  }

  return (
    <Workspace
      initialSession={screen.session}
      sessions={screen.sessions}
      onBack={() => setScreen({ type: "list" })}
    />
  );
}
