const MOTION_PRESETS = {
  static: ({ fps }) =>
    [
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      `fps=${fps}`,
    ].join(","),

  slow_zoom_in: ({ frames, fps }) =>
    [
      "scale=1400:2489:force_original_aspect_ratio=increase",
      "crop=1400:2489",
      [
        "zoompan=",
        "z='min(zoom+0.0008,1.10)'",
        "x='iw/2-(iw/zoom/2)'",
        "y='ih/2-(ih/zoom/2)'",
        `d=${frames}`,
        "s=1080x1920",
        `fps=${fps}`,
      ].join(":"),
    ].join(","),

  slow_zoom_out: ({ frames, fps }) =>
    [
      "scale=1400:2489:force_original_aspect_ratio=increase",
      "crop=1400:2489",
      [
        "zoompan=",
        "z='if(eq(on,0),1.10,max(zoom-0.0008,1.0))'",
        "x='iw/2-(iw/zoom/2)'",
        "y='ih/2-(ih/zoom/2)'",
        `d=${frames}`,
        "s=1080x1920",
        `fps=${fps}`,
      ].join(":"),
    ].join(","),

  pan_left: ({ frames, fps }) =>
    [
      "scale=1200:2134:force_original_aspect_ratio=increase",
      "crop=1200:2134",
      [
        "zoompan=",
        "z='1.0'",
        `x='(iw-ow)*(1-on/${Math.max(frames - 1, 1)})'`,
        "y='(ih-oh)/2'",
        `d=${frames}`,
        "s=1080x1920",
        `fps=${fps}`,
      ].join(":"),
    ].join(","),

  pan_right: ({ frames, fps }) =>
    [
      "scale=1200:2134:force_original_aspect_ratio=increase",
      "crop=1200:2134",
      [
        "zoompan=",
        "z='1.0'",
        `x='(iw-ow)*(on/${Math.max(frames - 1, 1)})'`,
        "y='(ih-oh)/2'",
        `d=${frames}`,
        "s=1080x1920",
        `fps=${fps}`,
      ].join(":"),
    ].join(","),

  zoom_pan: ({ frames, fps }) =>
    [
      "scale=1400:2489:force_original_aspect_ratio=increase",
      "crop=1400:2489",
      [
        "zoompan=",
        "z='min(zoom+0.0007,1.08)'",
        `x='(iw-iw/zoom)*(on/${Math.max(frames - 1, 1)})'`,
        "y='ih/2-(ih/zoom/2)'",
        `d=${frames}`,
        "s=1080x1920",
        `fps=${fps}`,
      ].join(":"),
    ].join(","),

  cinematic_shake: ({ frames, fps }) =>
    [
      "scale=1400:2489:force_original_aspect_ratio=increase",
      "crop=1400:2489",
      [
        "zoompan=",
        "z='min(zoom+0.0005,1.06)'",
        "x='iw/2-(iw/zoom/2)+6*sin(on*0.8)'",
        "y='ih/2-(ih/zoom/2)+5*cos(on*0.65)'",
        `d=${frames}`,
        "s=1080x1920",
        `fps=${fps}`,
      ].join(":"),
    ].join(","),
};

const TONE_DEFAULTS = {
  mystery: "cinematic_shake",
  horror: "cinematic_shake",
  suspense: "cinematic_shake",
  history: "slow_zoom_in",
  educational: "slow_zoom_in",
  technology: "zoom_pan",
  nature: "pan_right",
  space: "slow_zoom_out",
  news: "static",
  comedy: "zoom_pan",
};

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function resolveMotion({ motion, tone }) {
  const requestedMotion = normalizeValue(motion);

  if (MOTION_PRESETS[requestedMotion]) {
    return requestedMotion;
  }

  const normalizedTone = normalizeValue(tone);

  return TONE_DEFAULTS[normalizedTone] || "slow_zoom_in";
}

function createMotionFilter({
  motion,
  tone,
  duration,
  fps = 30,
}) {
  const selectedMotion = resolveMotion({ motion, tone });
  const safeDuration = Math.max(Number(duration) || 1, 0.1);
  const frames = Math.max(Math.ceil(safeDuration * fps), 1);

  return {
    selectedMotion,
    filter: MOTION_PRESETS[selectedMotion]({
      duration: safeDuration,
      frames,
      fps,
    }),
  };
}

module.exports = {
  MOTION_PRESETS,
  TONE_DEFAULTS,
  resolveMotion,
  createMotionFilter,
};
