#!/usr/bin/env node
/* TypeScript 7 ships the native compiler without the JS checker API that
 * vue-tsc requires. Use the TypeScript 6 checker package for SFC typechecking
 * while keeping TypeScript 7 as the project baseline compiler. */
const tscPath = require.resolve('@typescript/typescript6/lib/tsc')
require('vue-tsc').run(tscPath)
