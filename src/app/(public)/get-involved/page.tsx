import type { Metadata } from "next";
import Image from "next/image";

import { siteInfo } from "@/components/layout/siteInfo";
import { buttonStyles } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icons";

// Get Involved page per docs/DESIGN.md "Get Involved page (/get-involved)".
// Copy comes from the spec verbatim; don't add copy that isn't there.

const body =
  "Healthier pets mean stronger families and a brighter community for generations to come.";

export const metadata: Metadata = {
  title: "Get Involved",
  description: body,
};

export default function GetInvolvedPage() {
  return (
    <section className="grid lg:min-h-[520px] lg:grid-cols-2">
      <div
        data-surface="dark"
        className="flex items-center bg-primary px-4 py-14 text-white sm:px-10 lg:py-20"
      >
        <div className="max-w-md lg:ml-auto lg:mr-12">
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Local Pets. Lasting Change.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/90">{body}</p>
          <a
            href={siteInfo.donateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles("accent", "mt-8")}
          >
            Support Our Work
            <ArrowRightIcon className="size-5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
      <div className="relative h-64 sm:h-80 lg:h-auto">
        <Image
          src="/images/mountains.jpg"
          alt="Forested mountain ridges rise above a valley filled with low clouds under a bright blue sky."
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    </section>
  );
}
