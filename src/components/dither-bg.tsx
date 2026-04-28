"use client";

import dynamic from "next/dynamic";

const Dither = dynamic(() => import("./dither"), { ssr: false });

export function DitherBackground() {
  return (
    <div className="fixed inset-0 -z-10 hidden md:block" style={{ filter: "invert(1)" }}>
      <Dither
        waveColor={[0.5, 0.5, 0.5]}
        disableAnimation={false}
        enableMouseInteraction
        mouseRadius={0.3}
        colorNum={8}
        waveAmplitude={0.18}
        waveFrequency={2.8}
        waveSpeed={0.01}
      />
    </div>
  );
}
