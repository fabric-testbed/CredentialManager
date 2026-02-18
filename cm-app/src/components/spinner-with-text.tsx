"use client";

import { Loader2 } from "lucide-react";

interface SpinnerWithTextProps {
  text: string;
}

export default function SpinnerWithText({ text }: SpinnerWithTextProps) {
  return (
    <div className="flex flex-row justify-center my-2">
      <Loader2 className="h-4 w-4 animate-spin text-fabric-primary mt-1" />
      <span className="text-fabric-primary ml-2 font-bold">{text}</span>
    </div>
  );
}
