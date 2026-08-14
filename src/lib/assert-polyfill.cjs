// Minimal `assert` polyfill for the browser. Babel's @babel/helper-module-imports
// (pulled in by babel-plugin-jsx-dom-expressions) does `require("assert")`; Node's
// assert isn't available in the webview. Must be CommonJS with the function as the
// module itself so CJS `require("assert")` gets a callable, not a namespace object.
function assert(value, message) {
  if (!value) throw new Error(typeof message === "string" ? message : "Assertion failed");
}
assert.fail = function (message) {
  throw message instanceof Error ? message : new Error(message || "Assertion failed");
};
assert.ok = assert;
assert.strict = assert;
assert.equal = function (actual, expected, message) {
  if (actual !== expected) throw new Error(message || "Assertion failed: " + actual + " !== " + expected);
};
module.exports = assert;
module.exports.default = assert;
