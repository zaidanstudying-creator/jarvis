interface MediaRequest {
  isMainFrame: boolean;
  requestingUrl?: string;
  mediaTypes?: readonly string[];
}
export function allowMicrophoneRequest(
  trustedWindow: boolean,
  permission: string,
  page: string,
  details: MediaRequest,
): boolean {
  return (
    trustedWindow &&
    permission === "media" &&
    details.isMainFrame &&
    details.requestingUrl === page &&
    details.mediaTypes?.length === 1 &&
    details.mediaTypes[0] === "audio"
  );
}
export function allowMicrophoneCheck(
  trustedWindow: boolean,
  permission: string,
  page: string,
  details: Omit<MediaRequest, "mediaTypes"> & { mediaType?: string },
): boolean {
  return (
    trustedWindow &&
    permission === "media" &&
    details.isMainFrame &&
    details.requestingUrl === page &&
    details.mediaType === "audio"
  );
}
