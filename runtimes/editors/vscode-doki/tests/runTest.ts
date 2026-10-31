import * as path from "node:path";
import { glob } from "glob";
import Mocha from "mocha";

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 10000,
    });

    const testsRoot = __dirname;

    return new Promise<void>((resolve, reject) => {
        glob("**/*.test.js", { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            files.forEach((f) => {
                mocha.addFile(path.resolve(testsRoot, f));
            });

            try {
                mocha.run((failures) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                console.error(err);
                reject(err as Error);
            }
        });
    });
}
