"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { featureFlags } from "@/lib/config";

interface HeaderProps {
  cmUserStatus: string;
}

export default function Header({ cmUserStatus }: HeaderProps) {
  const pathname = usePathname();

  const handleLogin = () => {
    localStorage.removeItem("cmUserStatus");
    window.location.href = "/login";
  };

  const handleLogout = () => {
    localStorage.removeItem("cmUserStatus");
    localStorage.removeItem("cmUserID");
    window.location.href = "/logout";
  };

  return (
    <nav className="flex items-center justify-between p-2 bg-fabric-bg-light">
      <Link href="/" className="flex items-center gap-2 no-underline">
        <Image
          src="/fabric-brand.png"
          width={70}
          height={30}
          alt="FABRIC Logo"
        />
        <span className="text-fabric-dark font-medium">
          FABRIC Credential Manager
        </span>
      </Link>

      {cmUserStatus === "active" && (
        <div className="flex flex-row gap-1">
          <Link
            href="/"
            className={cn(
              "px-3 py-1 text-sm rounded no-underline",
              pathname === "/"
                ? "bg-fabric-primary text-white"
                : "border border-fabric-primary text-fabric-primary hover:bg-fabric-primary/10"
            )}
          >
            FABRIC Tokens
          </Link>
          {featureFlags.llmTokens && (
            <Link
              href="/llm"
              className={cn(
                "px-3 py-1 text-sm rounded no-underline",
                pathname === "/llm"
                  ? "bg-fabric-primary text-white"
                  : "border border-fabric-primary text-fabric-primary hover:bg-fabric-primary/10"
              )}
            >
              LLM Tokens
            </Link>
          )}
        </div>
      )}

      <div>
        {cmUserStatus === "active" ? (
          <button
            onClick={handleLogout}
            className="px-3 py-1 text-sm border border-fabric-success text-fabric-success rounded hover:bg-fabric-success/10"
          >
            Log out
          </button>
        ) : (
          <button
            onClick={handleLogin}
            className="px-3 py-1 text-sm border border-fabric-success text-fabric-success rounded hover:bg-fabric-success/10"
          >
            Log in
          </button>
        )}
      </div>
    </nav>
  );
}
