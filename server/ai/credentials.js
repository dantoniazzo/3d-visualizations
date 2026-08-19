import fs from "fs";
import os from "os";
import path from "path";

/**
 * Whether the Anthropic SDK will find credentials.
 *
 * The SDK resolves in this order: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
 * an OAuth profile written by `ant auth login`, then Workload Identity
 * Federation. An unset API key therefore does NOT mean "no credentials" —
 * checking only the env var would 503 a perfectly good subscription login.
 *
 * This is a cheap pre-flight so the UI can say something useful before
 * spending a request; the SDK remains the real authority.
 */
export function hasCredentials() {
    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
        return true;
    }

    // Workload identity federation (CI, containers).
    if (
        process.env.ANTHROPIC_FEDERATION_RULE_ID &&
        (process.env.ANTHROPIC_IDENTITY_TOKEN || process.env.ANTHROPIC_IDENTITY_TOKEN_FILE)
    ) {
        return true;
    }

    return Boolean(oauthProfilePath());
}

/** Path to the active `ant auth login` credential file, if one exists. */
export function oauthProfilePath() {
    const dir =
        process.env.ANTHROPIC_CONFIG_DIR || path.join(os.homedir(), ".config", "anthropic");
    const profile = process.env.ANTHROPIC_PROFILE || "default";
    const file = path.join(dir, "credentials", `${profile}.json`);

    try {
        return fs.existsSync(file) ? file : null;
    } catch {
        return null;
    }
}

/** How the credentials were found — surfaced by /api/health for debugging. */
export function credentialSource() {
    if (process.env.ANTHROPIC_API_KEY) return "api_key";
    if (process.env.ANTHROPIC_AUTH_TOKEN) return "auth_token";
    if (oauthProfilePath()) return `oauth_profile:${process.env.ANTHROPIC_PROFILE || "default"}`;
    if (process.env.ANTHROPIC_FEDERATION_RULE_ID) return "federation";
    return null;
}

export const NO_CREDENTIALS_MESSAGE =
    "No Anthropic credentials found. Either set ANTHROPIC_API_KEY in .env, or run `ant auth login` " +
    "to sign in with your Anthropic account, then restart the server.";
