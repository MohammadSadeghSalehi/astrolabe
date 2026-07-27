import { AbsoluteFill, Audio, OffthreadVideo, staticFile } from "remotion";

export const EndCard = () => (
  <AbsoluteFill className="end-card">
    <Audio src={staticFile("vo/end.mp3")} volume={0.95} playbackRate={1.15} />
    <OffthreadVideo
      src={staticFile("end-plate.mp4")}
      muted
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
    <AbsoluteFill className="end-card-vignette" />
    <div className="end-card-copy">
      <div className="end-card-lockup">⊘ ASTROLABE</div>
      <div className="end-card-tagline">read the hours you couldn&apos;t record</div>
      {/* The hosted demo was retired after the event. The rendered film in
          app/public/astrolabe-demo.mp4 still shows the old URL burned into its
          last three seconds — re-render this composition to correct it. */}
      <div className="end-card-url">github.com/MohammadSadeghSalehi/astrolabe</div>
      <div className="end-card-disclaimer">
        not a medical device · COPS data CC-BY 4.0
      </div>
    </div>
  </AbsoluteFill>
);
