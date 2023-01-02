/** @type {import('jest').Config} */
const config = {
    transform: {},
    transformIgnorePatterns: [
        "node_modules/(?!d3)/"
    ],
    moduleNameMapper: {
         "^d3-(.*)$": `d3-$1/dist/d3-$1`
    }
};

module.exports = config;