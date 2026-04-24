"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import AccountPage from "@/components/AccountPage";

export default function AccountRoute() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const auth = await api.get("/api/auth/check");
        if (auth.authenticated && auth.user) {
          setUserEmail(auth.user.email);
        }
      } catch { /* middleware handles redirect */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="screen">
        <div className="login-container"><div className="spinner" /></div>
      </div>
    );
  }

  return (
    <AccountPage
      currentEmail={userEmail}
      onLogout={() => router.replace("/login")}
    />
  );
}
