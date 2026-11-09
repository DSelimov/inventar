import Link from "next/link";
import { Boxes } from "lucide-react";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/help" className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white">
          <Boxes className="h-5 w-5" />
        </span>
        <span className="text-lg font-semibold">Складио · Помощ</span>
      </Link>
      {children}
    </div>
  );
}
