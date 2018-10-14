// KLE - kshoot lane effector

const fs = require('fs');
const KLEProcessor = require("./lib/processor.js");

const file_names = process.argv.slice(-3);
const in_file_name = file_names[0];
const kle_file_name = file_names[1];
const out_file_name = file_names[2];

const proc = new KLEProcessor(kle_file_name);
const result = proc.process(fs.readFileSync(in_file_name, 'utf-8'));

fs.writeFileSync(out_file_name, result, 'utf-8');
