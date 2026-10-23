import { defineConfig } from "@doki-land/nifty"

export default defineConfig({
    publish: {
        packages: [
            '@doki-land/doki',
            '@doki-land/doki-plugin',
            '@doki-land/doki-theme',
            '@doki-land/doki-darwin-arm64',
            '@doki-land/doki-darwin-x64',
            '@doki-land/doki-linux-arm64',
            '@doki-land/doki-linux-x64',
            '@doki-land/doki-win32-arm64',
            '@doki-land/doki-win32-x64',
        ],
    },
    trust: {
        npm: {
            repo: 'doki-land/doki-engine',
            file: 'release-npm.yml',
            env: '',
        },
    },
})
