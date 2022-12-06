import type { JestConfigWithTsJest } from "ts-jest";

const jestConfig: JestConfigWithTsJest = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["./src"],
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
            },
        ],

        './uint.js': [
            "ts-jest",
            {
                useESM: true,
            },
        ],

    },
    fakeTimers: {},
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: {
        uuid: require.resolve("uuid"),
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    transformIgnorePatterns: [],

    /*  useESM: true, */
    testRegex: "/__tests__/[A-Za-z0-9-/]+(\\.integration)?\\.(test|spec)\\.ts$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    testTimeout: 60000
    /*   coverageReporters: ["lcov"] */
};
export default jestConfig;
