import { it, expect } from "vitest";
import {
  allowMicrophoneCheck,
  allowMicrophoneRequest,
} from "../src/main/permissions";
const page = "file:///app/index.html";
const request = {
  isMainFrame: true,
  requestingUrl: page,
  mediaTypes: ["audio"],
};
it("grants only microphone requests from the trusted local main frame", () => {
  expect(allowMicrophoneRequest(true, "media", page, request)).toBe(true);
  for (const change of [
    { isMainFrame: false },
    { requestingUrl: "https://untrusted.example" },
    { mediaTypes: ["video"] },
    { mediaTypes: ["audio", "video"] },
    { mediaTypes: [] },
    { mediaTypes: undefined },
  ])
    expect(
      allowMicrophoneRequest(true, "media", page, { ...request, ...change }),
    ).toBe(false);
  expect(allowMicrophoneRequest(false, "media", page, request)).toBe(false);
  expect(allowMicrophoneRequest(true, "display-capture", page, request)).toBe(
    false,
  );
});
it("denies camera and unknown media in permission checks as well as requests", () => {
  const details = {
    isMainFrame: true,
    requestingUrl: page,
    mediaType: "audio",
  };
  expect(allowMicrophoneCheck(true, "media", page, details)).toBe(true);
  for (const change of [
    { isMainFrame: false },
    { requestingUrl: undefined },
    { mediaType: "video" },
    { mediaType: "unknown" },
    { mediaType: undefined },
  ])
    expect(
      allowMicrophoneCheck(true, "media", page, { ...details, ...change }),
    ).toBe(false);
});
