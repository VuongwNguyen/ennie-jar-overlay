// Picks which dog the overlay shows. The pre-rendered poodle with real fur is the default; add ?dog=3d,
// ?dog=toon, ?dog=glb or ?dog=svg to the URL for the others. Each version is only loaded when asked for.
// Add ?cat=1 to sit the fluffy kitten on top of the jar.
const params = new URLSearchParams(location.search);
const mode = params.get("dog");

if (mode === "toon") {
  import("/dogtoon.js")
    .then(toon => toon.startToonDog())
    .catch(error => console.warn("dog: cartoon puppy failed, keeping the SVG dog", error));
} else if (mode) {
  import("/dog3d.js");
} else {
  import("/dogsprite.js")
    .then(sprite => sprite.startSpriteDog())
    .catch(error => {
      console.warn("dog: pre-rendered poodle failed, using the 3D dog", error);
      import("/dog3d.js");
    });
}

// The animated sticker (make_sticker.mjs) sits on the mouth of the jar, with its bone resting on the rim.
// It stays outside the scaled scene and on whole pixels at its own size, because enlarging a small
// picture breaks it up.
if (!params.has("nosticker")) {
  const WIDTH = 384, HEIGHT = 256;
  const BONE_X = 190, BONE_BOTTOM = 238; // the bone in the picture
  const JAR_CENTRE = 155, RIM = 34; // the mouth of the jar, in .jar-wrap coordinates
  const sticker = new Image();
  sticker.className = "ennie-sticker";
  sticker.alt = "";
  sticker.src = "/models/ennie.png";
  document.body.append(sticker);
  const place = () => {
    const jar = document.getElementById("jarWrap").getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")) || 1;
    const pixel = 1 / devicePixelRatio;
    const rimY = jar.top + RIM * scale;
    const fit = Math.min(1, rimY / (BONE_BOTTOM * pixel), innerWidth / (WIDTH * pixel)); // only ever shrinks
    const width = Math.round(WIDTH * fit) * pixel, height = Math.round(HEIGHT * fit) * pixel;
    const snap = value => Math.round(value / pixel) * pixel;
    const left = jar.left + JAR_CENTRE * scale - BONE_X * fit * pixel;
    sticker.style.width = `${width}px`;
    sticker.style.height = `${height}px`;
    sticker.style.left = `${snap(Math.max(0, Math.min(innerWidth - width, left)))}px`;
    sticker.style.top = `${snap(rimY - BONE_BOTTOM * fit * pixel)}px`;
  };
  addEventListener("resize", () => requestAnimationFrame(place));
  requestAnimationFrame(place);
}

if (params.has("cat")) {
  const cat = new Image();
  cat.className = "jar-cat";
  cat.alt = "";
  cat.src = "/models/cat.png";
  document.getElementById("jarWrap").append(cat);
}
