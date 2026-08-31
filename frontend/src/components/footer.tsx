export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col gap-1 py-6 text-sm text-slate-500">
        <p className="font-medium text-slate-700">learndev shop</p>
        <p>
          A DevOps learning lab: Next.js storefront in front of two NestJS services, routed by
          Traefik.
        </p>
      </div>
    </footer>
  );
}
