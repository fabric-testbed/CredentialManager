"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import clearLocalStorage from "@/utils/clear-local-storage";

interface SessionTimeoutModalProps {
  timeLeft: number;
  open: boolean;
  onClose: () => void;
}

export default function SessionTimeoutModal({
  timeLeft,
  open,
  onClose,
}: SessionTimeoutModalProps) {
  const [minutes, setMinutes] = useState(
    Math.floor(timeLeft / 60000)
  );
  const [seconds, setSeconds] = useState(
    Math.round((timeLeft % 60000) / 1000)
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;

    let m = Math.floor(timeLeft / 60000);
    let s = Math.round((timeLeft % 60000) / 1000);
    setMinutes(m);
    setSeconds(s);

    timerRef.current = setInterval(() => {
      if (s > 0) {
        s--;
      } else if (m > 0) {
        m--;
        s = 59;
      } else {
        handleLogout();
        return;
      }
      setMinutes(m);
      setSeconds(s);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, timeLeft]);

  const handleLogout = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    clearLocalStorage();
    window.location.href = "/logout";
  };

  const parseTimeStr = (m: number, s: number): string => {
    const parts: string[] = [];
    if (m > 0) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
    if (s > 0) parts.push(`${s} second${s > 1 ? "s" : ""}`);
    return parts.join(" ") || "0 seconds";
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Session Timeout</DialogTitle>
        </DialogHeader>
        <p>
          The current session is about to expire in{" "}
          <span className="text-fabric-danger font-bold">
            {parseTimeStr(minutes, seconds)}
          </span>
          . Please save your work to prevent loss of data.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleLogout}>Logout</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
