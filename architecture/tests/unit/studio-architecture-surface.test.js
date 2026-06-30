import { test, expect } from "bun:test";
import { parseArchitecture } from "../../../src/studio/architectureSurface.js";

test("Studio parses a root society as one multi-mind with an inferred face", () => {
  const meta = parseArchitecture(`<!-- a society -->
<m-society name="hearth-society">
  <m-mind name="face" interlocutor="Margit" stage="experimental" model="voice" utilityModel="utility" pace="18s">
    <m-origin name="origin">Begin with listening.</m-origin>
    <m-speech name="voice"></m-speech>
    <m-ws name="ws"></m-ws>
  </m-mind>
  <m-mind name="kin"><m-speech name="voice"></m-speech></m-mind>
</m-society>`);

  expect(meta.kind).toBe("society");
  expect(meta.name).toBe("hearth-society");
  expect(meta.memory).toBe("hearth-society");
  expect(meta.stage).toBe("experimental");
  expect(meta.hasWs).toBe(true);
  expect(meta.interlocutor).toBe("Margit");
  expect(meta.origin).toBe("Begin with listening.");
  expect(meta.surface).toEqual({ face: "face", ear: "face/ws", mouth: "face/voice", declared: false });
  expect(meta.members.map(m => m.name)).toEqual(["face", "kin"]);
});

test("Studio honors explicit society external ear and mouth attributes", () => {
  const meta = parseArchitecture(`<m-society name="council"
    external-face="speaker"
    external-ear="listener/ws"
    external-mouth="speaker/public-voice">
  <m-mind name="listener"><m-ws name="ws"></m-ws></m-mind>
  <m-mind name="speaker"><m-speech name="public-voice"></m-speech></m-mind>
</m-society>`);

  expect(meta.kind).toBe("society");
  expect(meta.surface).toEqual({
    face: "speaker",
    ear: "listener/ws",
    mouth: "speaker/public-voice",
    declared: true,
  });
});

test("Studio keeps single-mind parsing unchanged", () => {
  const meta = parseArchitecture(`<m-mind name="seed" memory="seed-home" interlocutor="Kris">
    <m-origin name="origin" prompt="old seed"></m-origin>
    <m-ws name="ws"></m-ws>
  </m-mind>`);

  expect(meta.kind).toBe("mind");
  expect(meta.name).toBe("seed");
  expect(meta.memory).toBe("seed-home");
  expect(meta.surface).toBe(null);
  expect(meta.origin).toBe("old seed");
  expect(meta.interlocutor).toBe("Kris");
  expect(meta.hasWs).toBe(true);
});
