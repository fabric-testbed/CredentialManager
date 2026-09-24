"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { featureFlags } from "@/lib/config";
import { useStorageOperator } from "@/hooks/use-storage-operator";

interface HeaderProps {
  cmUserStatus: string;
}

export default function Header({ cmUserStatus }: HeaderProps) {
  const pathname = usePathname();
  const isStorageOperator = useStorageOperator(cmUserStatus === "active");

  const handleLogin = () => {
    sessionStorage.removeItem("cmUserStatus");
    window.location.href = "/login";
  };

  const handleLogout = () => {
    sessionStorage.removeItem("cmUserStatus");
    sessionStorage.removeItem("cmUserID");
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
          {featureFlags.storage && (
            <Link
              href="/storage"
              className={cn(
                "px-3 py-1 text-sm rounded no-underline",
                // Exact match: /storage/admin must not light up both links.
                pathname === "/storage"
                  ? "bg-fabric-primary text-white"
                  : "border border-fabric-primary text-fabric-primary hover:bg-fabric-primary/10"
              )}
            >
              Storage
            </Link>
          )}
          {featureFlags.storage && isStorageOperator && (
            <Link
              href="/storage/admin"
              className={cn(
                "px-3 py-1 text-sm rounded no-underline",
                pathname === "/storage/admin"
                  ? "bg-fabric-primary text-white"
                  : "border border-fabric-primary text-fabric-primary hover:bg-fabric-primary/10"
              )}
            >
              Storage Admin
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
