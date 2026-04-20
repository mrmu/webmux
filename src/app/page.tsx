"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import LoginScreen from "@/components/LoginScreen";
import SessionList, { type SessionInfo } from "@/components/SessionList";
import Workspace from "@/components/Workspace";
import AccountPage from "@/components/AccountPage";

type Screen =
  | { type: "loading" }
  | { type: "login"; isFirstUser: boolean }
  | { type: "list" }
  | { type: "workspace"; session: string; sessions: SessionInfo[] }
  | { type: "account" };

export default function Home() {
  const [screen, setScreen] = useState<Screen>({ type: "loading" });
  const [userEmail, setUserEmail] = useState("");

  const checkAuth = async () => {
    try {
      const auth = await api.get("/api/auth/check");
      if (auth.authenticated) {
        setUserEmail(auth.user?.email || "");
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
        onSuccess={checkAuth}
        isFirstUser={screen.isFirstUser}
      />
    );
  }

  if (screen.type === "account") {
    return (
      <AccountPage
        currentEmail={userEmail}
        onBack={() => setScreen({ type: "list" })}
        onLogout={() => {
          setUserEmail("");
          setScreen({ type: "login", isFirstUser: false });
        }}
      />
    );
  }

  if (screen.type === "list") {
    return (
      <SessionList
        onOpenWorkspace={(name, sessions) =>
          setScreen({ type: "workspace", session: name, sessions })
        }
        onOpenAccount={() => setScreen({ type: "account" })}
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
