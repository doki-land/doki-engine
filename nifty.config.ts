// Nifty trust config for doki-engine — local only (gitignored-ish).
// Used by `nifty trust -C .` to configure npm Trusted Publisher.
// Release is OIDC via release-npm.yml (no NPM_PUBLISH env filter).
import { defineConfig } from "@doki-land/nifty";

export default defineConfig({
    trust: {
        npm: {
            repo: "doki-land/doki-engine",
            file: "release-npm.yml",
            environment: "",
        },
    },
});
