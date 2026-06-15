"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initData?: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            username?: string;
            first_name?: string;
            last_name?: string;
          };
        };
        platform?: string;
        version?: string;
        colorScheme?: "light" | "dark";
        backgroundColor?: string;
        setHeaderColor?: (color: string) => void;
      };
    };
  }
}

export type TelegramMiniAppState = {
  isAvailable: boolean;
  initData: string;
  platform: string | null;
  version: string | null;
  user:
    | {
        id: number;
        username?: string;
        first_name?: string;
        last_name?: string;
      }
    | null;
};

const defaultTelegramState: TelegramMiniAppState = {
  isAvailable: false,
  initData: "",
  platform: null,
  version: null,
  user: null,
};

function readTelegramMiniAppState(): TelegramMiniAppState {
  if (typeof window === "undefined") {
    return defaultTelegramState;
  }

  const webApp = window.Telegram?.WebApp;

  if (!webApp) {
    return defaultTelegramState;
  }

  return {
    isAvailable: true,
    initData: webApp.initData ?? "",
    platform: webApp.platform ?? null,
    version: webApp.version ?? null,
    user: webApp.initDataUnsafe?.user ?? null,
  };
}

export function useTelegramMiniApp() {
  const [state] = useState<TelegramMiniAppState>(() => readTelegramMiniAppState());

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;

    if (!webApp) {
      return;
    }

    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.("#0A0A0F");
  }, []);

  return state;
}
