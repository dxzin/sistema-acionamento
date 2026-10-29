"use client";

import Script from "next/script";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "dark" | "light" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileWidgetHandle {
  reset(): void;
}

interface TurnstileWidgetProps {
  siteKey: string;
  onTokenChange(token: string | null): void;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onTokenChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    const renderWidget = useCallback(() => {
      const container = containerRef.current;
      const turnstile = window.turnstile;
      if (!container || !turnstile || widgetIdRef.current) return;

      widgetIdRef.current = turnstile.render(container, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token) => onTokenChange(token),
        "expired-callback": () => onTokenChange(null),
        "error-callback": () => onTokenChange(null),
      });
    }, [onTokenChange, siteKey]);

    useImperativeHandle(ref, () => ({
      reset() {
        onTokenChange(null);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }), [onTokenChange]);

    return (
      <>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={renderWidget}
        />
        <div ref={containerRef} className="flex min-h-[65px] justify-center" aria-label="Verificação de segurança" />
      </>
    );
  },
);
