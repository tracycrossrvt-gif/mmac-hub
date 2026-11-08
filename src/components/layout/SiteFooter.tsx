import Image from "next/image";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { FacebookIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { siteInfo } from "./siteInfo";

const linkClass = "rounded-sm underline-offset-4 hover:underline";

export function SiteFooter() {
  return (
    <footer data-surface="dark" className="bg-primary text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <Link href="/" className="inline-block rounded-2xl">
            {/* Sand badge: the logo's magenta text has poor contrast on navy. */}
            <span className="inline-block rounded-2xl bg-sand p-3">
              <Image
                src="/images/logo.png"
                alt="Macon Moves Animal Care"
                width={275}
                height={314}
                className="h-20 w-auto"
              />
            </span>
          </Link>
          <p className="mt-4">Serving Macon, Jackson, and Rabun Counties.</p>
        </div>

        <div>
          <h2 className="font-display text-xl font-semibold">Contact</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <a href={siteInfo.phoneHref} className={`inline-flex items-center gap-2 ${linkClass}`}>
                <PhoneIcon className="size-5" />
                {siteInfo.phoneDisplay}
              </a>
            </li>
            <li>
              <a href={`mailto:${siteInfo.email}`} className={`inline-flex items-center gap-2 break-all ${linkClass}`}>
                <MailIcon className="size-5 shrink-0" />
                {siteInfo.email}
              </a>
            </li>
            <li>
              <a href={siteInfo.facebookUrl} className={`inline-flex items-center gap-2 ${linkClass}`}>
                <FacebookIcon className="size-5" />
                Facebook
              </a>
            </li>
          </ul>
        </div>

        <div>
          <a
            href={siteInfo.donateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles("accent")}
          >
            Donate
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="mt-4 text-sm text-white/85">{siteInfo.fiscalSponsor}</p>
        </div>
      </div>

      <div className="border-t border-white/20">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-sm sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 Macon Moves Animal Care</p>
          <p>
            <a href={siteInfo.portfolioUrl} className={`underline ${linkClass}`}>
              Portfolio demo built by Tracy Cross
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
