import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
// Both SDKs use Node fetch. Honor managed/user proxy routing without weakening TLS.
export function configureNetwork() {
  if (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  )
    setGlobalDispatcher(new EnvHttpProxyAgent());
}
