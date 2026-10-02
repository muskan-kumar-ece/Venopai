export const ReviewCard = ({ comment }: { comment?: string }) => (
  <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-zinc-200 text-sm">
    {comment || "Review"}
  </div>
);
