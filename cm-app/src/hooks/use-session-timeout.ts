"use client";

import { useState, useEffect, useRef } from "react";
import {
  FIVE_MIN_BEFORE_COOKIE_EXPIRES,
  ONE_MIN_BEFORE_COOKIE_EXPIRES,
} from "@/lib/cm-data";

interface SessionTimeoutState {
  showModal1: boolean;
  showModal2: boolean;
  closeModal1: () => void;
  closeModal2: () => void;
}

export function useSessionTimeout(isActive: boolean): SessionTimeoutState {
  const [showModal1, setShowModal1] = useState(false);
  const [showModal2, setShowModal2] = useState(false);
  const timer1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) return;

    timer1Ref.current = setTimeout(() => {
      setShowModal1(true);
    }, FIVE_MIN_BEFORE_COOKIE_EXPIRES);

    timer2Ref.current = setTimeout(() => {
      setShowModal1(false);
      setShowModal2(true);
    }, ONE_MIN_BEFORE_COOKIE_EXPIRES);

    return () => {
      if (timer1Ref.current) clearTimeout(timer1Ref.current);
      if (timer2Ref.current) clearTimeout(timer2Ref.current);
    };
  }, [isActive]);

  const closeModal1 = () => setShowModal1(false);
  const closeModal2 = () => setShowModal2(false);

  return { showModal1, showModal2, closeModal1, closeModal2 };
}
