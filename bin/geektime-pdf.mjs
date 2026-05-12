#!/usr/bin/env node
import { run } from '../src/cli.mjs';
run().catch(err => {
  console.error(`\n错误: ${err.message}\n`);
  process.exit(1);
});
