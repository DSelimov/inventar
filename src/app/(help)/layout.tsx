import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/help" className="mb-6 flex w-fit">
        <Logo suffix="· Помощ" />
      </Link>
      {children}
    </div>
  );
}
