import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import {
  ArrowRightIcon,
  CatIcon,
  HomeIcon,
  MedicalCrossIcon,
  StethoscopeIcon,
  SyringeIcon,
} from "@/components/ui/icons";

// Our Programs page per docs/DESIGN.md "Our Programs page (/programs)".
// Copy comes from the spec verbatim; don't add copy that isn't there.

const body =
  "Affordable veterinary care and support for families in Macon, Jackson, and Rabun Counties.";

export const metadata: Metadata = {
  title: "Our Programs",
  description: body,
};

// Header photo. When /public/images/programs.jpg is added, set this to
// { src: "/images/programs.jpg", alt: "<describe the photo>" }. While it's
// null the navy panel spans the full width.
const photo: { src: string; alt: string } | null = null;

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const services: { label: string; Icon: Icon }[] = [
  { label: "Spay/Neuter", Icon: MedicalCrossIcon },
  { label: "Vaccines & Preventatives", Icon: SyringeIcon },
  { label: "Basic Care", Icon: StethoscopeIcon },
  { label: "TNR / Community Cats", Icon: CatIcon },
  { label: "Homeless Animal Support", Icon: HomeIcon },
];

export default function ProgramsPage() {
  return (
    <>
      <HeaderBand />
      <Services />
    </>
  );
}

function HeaderBand() {
  // Same pattern as /get-involved: navy panel left, photo right, stacked on
  // mobile with text first.
  return (
    <section className={photo ? "grid lg:min-h-[400px] lg:grid-cols-2" : ""}>
      <div
        data-surface="dark"
        className={`flex items-center bg-primary py-14 text-white lg:py-20 ${photo ? "px-4 sm:px-10" : ""}`}
      >
        <div className={photo ? "max-w-md lg:ml-auto lg:mr-12" : "mx-auto w-full max-w-6xl px-4 sm:px-6"}>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">How We Help</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/90">{body}</p>
        </div>
      </div>
      {photo && (
        <div className="relative h-64 sm:h-80 lg:h-auto">
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      )}
    </section>
  );
}

function Services() {
  return (
    <section aria-label="Services" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {services.map(({ label, Icon }) => (
          <li
            key={label}
            className="flex flex-col items-center gap-3 rounded-2xl bg-sand px-3 py-6 text-center"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-white text-secondary">
              <Icon className="size-6" />
            </span>
            <h2 className="text-sm font-semibold text-primary sm:text-base">{label}</h2>
          </li>
        ))}
      </ul>
      <div className="mt-12 flex justify-center">
        <Link href="/get-help" className={buttonStyles("accent")}>
          Get Help for Your Pet
          <ArrowRightIcon className="size-5" />
        </Link>
      </div>
    </section>
  );
}
