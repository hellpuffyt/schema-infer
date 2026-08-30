#!/usr/bin/env node
/** Executable wrapper: keeps `cli.ts` importable and side-effect free. */

import { main } from './cli.js';

process.exit(main());
