"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createElement } from "react";
import { getWhoAmI } from "@/services/core-api-service";
import { toast } from "sonner";

type UserStatus = "" | "active" | "unauthorized" | "inactive";

interface UserStatusContextValue {
  cmUserStatus: UserStatus;
}

const UserStatusContext = createContext<UserStatusContextValue>({
  cmUserStatus: "",
});

export function useUserStatus() {
  return useContext(UserStatusContext);
}

export function UserStatusProvider({ children }: { children: ReactNode }) {
  const [cmUserStatus, setCmUserStatus] = useState<UserStatus>(() => {
    if (typeof window === "undefined") return "";
    return (localStorage.getItem("cmUserStatus") as UserStatus) || "";
  });

  const checkEnrollment = useCallback(async () => {
    if (localStorage.getItem("cmUserStatus")) {
      setCmUserStatus(localStorage.getItem("cmUserStatus") as UserStatus);
      return;
    }

    try {
      const { data } = await getWhoAmI();
      const user = data.results[0];
      if (user.enrolled) {
        localStorage.setItem("cmUserID", user.uuid);
        localStorage.setItem("cmUserStatus", "active");
        setCmUserStatus("active");
      } else {
        toast.error("Please enroll to FABRIC in the Portal first.");
      }
    } catch {
      localStorage.setItem("cmUserStatus", "unauthorized");
      setCmUserStatus("unauthorized");
    }
  }, []);

  useEffect(() => {
    checkEnrollment();
  }, [checkEnrollment]);

  return createElement(
    UserStatusContext.Provider,
    { value: { cmUserStatus } },
    children
  );
}
