#!/usr/bin/env node
'use strict';
const { bridgeReadiness } = require('./health.cjs');
console.log(JSON.stringify(bridgeReadiness(process.env), null, 2));
