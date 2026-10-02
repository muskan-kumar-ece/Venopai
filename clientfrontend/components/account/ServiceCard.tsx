export const ServiceCard = ({ title }: { title?: string }) => (
  <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white p-4 rounded-xl shadow-sm">
    {title || "Service"}
  </div>
);
