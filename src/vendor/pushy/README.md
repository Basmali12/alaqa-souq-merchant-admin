# Pushy Web SDK 1.0.24 runtime

Unmodified runtime source from the official pushy-sdk-web 1.0.24 npm package
(https://github.com/pushy/pushy-sdk-web). Apache-2.0; distributed license:
public/licenses/pushy-sdk-web-LICENSE.txt.

Only the five runtime JavaScript modules are vendored. The npm shrinkwrap also
installs obsolete build tooling; it is intentionally not a project dependency.

Alaka's scoped-push.ts configures token/tokenAuth/tokenAppId keys through the
SDK config object once per page, before registration. No global Storage API
monkeypatch, token swapping, endpoint change, or altered Pushy protocol.

Keep this version pinned. On upgrade, rerun push-isolation tests against the actual
SDK cache branch and the browser build. Never copy the ambiguous legacy pushyToken
into a scoped cache. First registration reuses that scope's PushSubscription and
upserts the existing deviceId through the unchanged server-side registration API.
