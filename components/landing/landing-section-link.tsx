"use client";

import * as React from "react";
import Link from "next/link";

import { getSamePageHashTargetId } from "@/lib/landing/same-page-hash";

type LandingSectionLinkProps = Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export function LandingSectionLink({ href, onClick, ...props }: LandingSectionLinkProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      props.target
    ) {
      return;
    }

    const targetId = getSamePageHashTargetId(href, window.location.href);
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    const targetUrl = new URL(href, window.location.href);
    event.preventDefault();
    if (window.location.hash !== targetUrl.hash) {
      window.history.pushState(null, "", targetUrl.hash);
    }
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <Link href={href} onClick={handleClick} {...props} />;
}
