"use client";

import { type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { UserStatusProvider, useUserStatus } from "@/hooks/use-user-status";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import Header from "@/components/header";
import Footer from "@/components/footer";
import SessionTimeoutModal from "@/components/session-timeout-modal";

function AppShell({ children }: { children: ReactNode }) {
  const { cmUserStatus } = useUserStatus();
  const { showModal1, showModal2, closeModal1, closeModal2 } =
    useSessionTimeout(cmUserStatus === "active");

  return (
    <div className="min-h-screen flex flex-col">
      <Header cmUserStatus={cmUserStatus} />
      <SessionTimeoutModal
        timeLeft={300000}
        open={showModal1}
        onClose={closeModal1}
      />
      <SessionTimeoutModal
        timeLeft={60000}
        open={showModal2}
        onClose={closeModal2}
      />
      <main className="flex-1">{children}</main>
      <Footer />
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <UserStatusProvider>
      <AppShell>{children}</AppShell>
    </UserStatusProvider>
  );
}
