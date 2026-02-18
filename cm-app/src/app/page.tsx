"use client";

import Image from "next/image";
import { useUserStatus } from "@/hooks/use-user-status";
import CredentialManagerPage from "@/app/cm/page";

export default function Home() {
  const { cmUserStatus } = useUserStatus();

  if (cmUserStatus === "active") {
    return <CredentialManagerPage />;
  }

  return (
    <div className="container mx-auto flex flex-col items-center p-4 min-h-[80vh] mt-8 mb-8">
      <h1 className="text-2xl font-bold">FABRIC Credential Manager</h1>
      <Image
        src="/fabric-brand.png"
        width={490}
        height={210}
        className="my-4"
        alt="FABRIC Logo"
      />
      <div className="bg-fabric-primary/10 border border-fabric-primary/30 text-fabric-dark rounded p-4 mb-4">
        Please consult{" "}
        <a
          href="https://learn.fabric-testbed.net/knowledge-base/obtaining-and-using-fabric-api-tokens/"
          target="_blank"
          rel="noreferrer"
          className="font-bold"
        >
          this guide
        </a>{" "}
        for obtaining and using FABRIC API tokens.
      </div>
    </div>
  );
}
