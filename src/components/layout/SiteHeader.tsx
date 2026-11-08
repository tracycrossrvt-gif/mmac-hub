"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonStyles } from "@/components/ui/button";
import { ComingSoonItem } from "@/components/ui/ComingSoon";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { navItems, siteInfo } from "./siteInfo";

const MOBILE_NAV_ID = "mobile-nav";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  function navLinks(variant: "desktop" | "mobile") {
    const linkClass =
      variant === "desktop"
        ? "rounded-md px-1 py-2 font-medium text-primary hover:underline underline-offset-4 aria-[current=page]:underline"
        : "block rounded-md px-3 py-3 font-medium text-primary hover:bg-sand aria-[current=page]:bg-sand";

    return navItems.map((item) => (
      <li key={item.label}>
        {"href" in item ? (
          <Link
            href={item.href}
            className={linkClass}
            aria-current={item.href === pathname ? "page" : undefined}
            onClick={close}
          >
            {item.label}
          </Link>
        ) : (
          <ComingSoonItem label={item.label} className={variant === "mobile" ? "px-3 py-3" : "py-2"} />
        )}
      </li>
    ));
  }

  const donate = (
    <a
      href={siteInfo.donateUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonStyles("accent")}
    >
      Donate
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );

  return (
    <header className="border-b border-sand bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md" onClick={close}>
          <Image
            src="/images/logo.png"
            alt="Macon Moves Animal Care"
            width={275}
            height={314}
            className="h-16 w-auto lg:h-[72px]"
            preload
          />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-6">{navLinks("desktop")}</ul>
        </nav>

        <div className="flex items-center gap-3">
          {donate}
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md text-primary hover:bg-sand lg:hidden"
            aria-expanded={open}
            aria-controls={MOBILE_NAV_ID}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      <nav
        id={MOBILE_NAV_ID}
        aria-label="Main"
        hidden={!open}
        className="border-t border-sand px-4 pb-4 pt-2 sm:px-6 lg:hidden"
      >
        <ul className="flex flex-col gap-1">{navLinks("mobile")}</ul>
      </nav>
    </header>
  );
}
