"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-20">
      <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_16px_rgba(0,0,0,0.04)] p-8">
        <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-3">
          Dashboard unavailable
        </p>
        <h1 className="text-2xl font-semibold tracking-tight mb-4">
          We couldn&apos;t load the data.
        </h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          This usually means the database is unreachable or the data pipeline hit an error.
          Try again in a moment. If it keeps failing, check the server logs.
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] text-muted-foreground mb-6">
            Error ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="font-mono text-xs tracking-widest uppercase bg-foreground text-background px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
