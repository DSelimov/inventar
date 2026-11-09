import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold">Не е намерено</h1>
      <p className="mt-2 text-sm text-muted">Страницата или записът, който търсите, не съществува.</p>
      <div className="mt-6">
        <ButtonLink href="/">Към началото</ButtonLink>
      </div>
    </div>
  );
}
