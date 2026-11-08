import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { ComingSoonPill } from "@/components/ui/ComingSoon";
import {
  ArrowRightIcon,
  BookIcon,
  CalendarIcon,
  PawIcon,
} from "@/components/ui/icons";

// Landing page per docs/DESIGN.md "Landing page (/)". Copy comes from the
// spec verbatim; don't add copy that isn't there.

const heroBody =
  "Affordable veterinary care, resources, and support for families in Macon, Jackson, and Rabun Counties.";

export const metadata: Metadata = {
  title: "Real Care for Real Life.",
  description: heroBody,
};

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const actionCards: { title: string; text: string; Icon: Icon; href?: string }[] = [
  {
    title: "Get Help",
    text: "Start the intake process for veterinary assistance.",
    Icon: PawIcon,
    href: "/get-help",
  },
  {
    title: "Find a Clinic Event",
    text: "Vaccines, clinics, and community services.",
    Icon: CalendarIcon,
  },
  {
    title: "Explore Resources",
    text: "Helpful information for pet health and care.",
    Icon: BookIcon,
  },
];

export default function Home() {
  return (
    <>
      <Hero />
      <ActionCards />
    </>
  );
}

function Hero() {
  // Split layout from md up: navy text panel left (~55%), portrait photo right
  // (~45%). Below md the photo (4:3) stacks above the navy text block.
  return (
    <section className="grid bg-primary md:min-h-[520px] md:grid-cols-[55fr_45fr] lg:min-h-[600px]">
      <div
        data-surface="dark"
        className="order-2 flex items-center px-4 py-10 text-white sm:px-8 md:order-1 md:py-14 lg:px-12"
      >
        <div className="w-full max-w-lg md:ml-auto">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Pets are family. We&apos;re here to help.
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            <span className="block">Real Care for</span>
            <span className="block">Real Life.</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/90">{heroBody}</p>
          <div className="mt-8 flex flex-col gap-3 lg:flex-row">
            <Link href="/get-help" className={buttonStyles("accent")}>
              Get Help for Your Pet
              <ArrowRightIcon className="size-5" />
            </Link>
            <Link href="/programs" className={buttonStyles("outlineLight")}>
              How We Help
            </Link>
          </div>
        </div>
      </div>

      <div className="relative order-1 aspect-[4/3] md:order-2 md:aspect-auto">
        <Image
          src="/images/hero.jpg"
          alt="A young tabby kitten with green eyes looks up at the camera from a cat tree."
          fill
          preload
          sizes="(min-width: 768px) 45vw, 100vw"
          className="object-cover object-[50%_10%] md:object-[50%_15%]"
        />
        {/* Soft edge where the navy panel meets the photo. */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 hidden w-20 bg-linear-to-r from-primary to-transparent md:block"
        />
      </div>
    </section>
  );
}

function ActionCards() {
  const cardBase = "flex h-full flex-col rounded-2xl bg-white p-5 shadow-md";
  return (
    <section aria-label="Get started" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <ul className="grid gap-4 md:grid-cols-3 lg:gap-6">
        {actionCards.map(({ title, text, Icon, href }) => {
          const body = (
            <>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sand text-secondary">
                  <Icon className="size-5" />
                </span>
                <h2 className="font-display text-lg font-semibold text-primary">{title}</h2>
              </div>
              <p className="mt-3 flex-1 text-text">{text}</p>
            </>
          );
          return (
            <li key={title}>
              {href ? (
                <Link href={href} className={`${cardBase} group transition-shadow hover:shadow-lg`}>
                  {body}
                  <ArrowRightIcon className="mt-3 size-5 text-primary transition-transform group-hover:translate-x-1" />
                </Link>
              ) : (
                <div aria-disabled="true" className={cardBase}>
                  {body}
                  <span className="mt-3">
                    <ComingSoonPill />
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
