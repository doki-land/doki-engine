declare module "@doki-land/doki-engine" {
    export class DokiEngine {
        constructor();
        hello(): string;
        registerTemplate(
            name: string,
            source: string,
            language?: DejavuLanguage,
        ): void;
        renderTemplate(name: string, context?: Record<string, unknown>): string;
        renderTemplateOnce(
            source: string,
            context?: Record<string, unknown>,
            language?: DejavuLanguage,
        ): string;
        buildTemplate(
            source: string | undefined,
            output: string | undefined,
            clean: boolean,
        ): Promise<void>;
        devTemplate(source: string | undefined, port: number): Promise<void>;
        checkTemplate(source: string, language?: DejavuLanguage): void;
    }
    export const engine: DokiEngine;
    export class DejavuLanguage {
        withTemplate(
            config: Partial<{
                codeStart: string;
                codeEnd: string;
                commentStart: string;
                commentEnd: string;
                supportFilterPipe: boolean;
                legacyFor: boolean;
            }>,
        ): this;
    }
    export const DOKI_LANGUAGE: DejavuLanguage;
    export const DEJAVU_LANGUAGE: DejavuLanguage;
}
