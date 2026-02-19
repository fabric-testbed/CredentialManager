"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";

interface SpinnerFullPageProps {
  text: string;
  showSpinner: boolean;
  btnText?: string;
  btnPath?: string;
}

export default function SpinnerFullPage({
  text,
  showSpinner,
  btnText,
  btnPath,
}: SpinnerFullPageProps) {
  if (!showSpinner) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50">
      <div className="flex flex-col items-center justify-center mx-5 px-5">
        <span className="text-white text-2xl mr-2 mb-2">{text}</span>
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
      {btnText && btnPath && (
        <Link
          href={btnPath}
          className="mt-4 px-4 py-2 bg-fabric-primary text-white rounded hover:bg-fabric-primary-dark"
        >
          {btnText}
        </Link>
      )}
    </div>
  );
}
