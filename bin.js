// KLE - ksh lane effector

const fs = require('fs');
const KLEProcessor = require("./lib/processor.js");

let positional_args = [];
let flag_args = {};

let curr_flag = '';
let flag_names = {
	'-i': 'in',
	'--in': 'in',
	
	'-k': 'kle',
	'--kle': 'kle',
	
	'-o': 'out',
	'--out': 'out',
	
	'-l': 'lua',
	'--lua': 'lua',
};

process.argv.slice(2).forEach((arg) => {
	if(curr_flag) {
		flag_args[curr_flag] = arg;
		arg = '';
		return;
	}
	if(arg in flag_names) {
		curr_flag = flag_names[arg];
		return;
	}
	positional_args.push(arg);
});

const in_file_name = flag_args['in'] || positional_args[0] || '';
const out_file_name = flag_args['out'] || positional_args[positional_args.length-1] || '';

const kle_file_name = flag_args['kle'] || '';
const lua_file_name = flag_args['lua'] || '';

if(!in_file_name || !out_file_name) {
	console.error("Usage: ./bin.js in.ksh out.ksh -k script.kle");
	process.exit(1);
}

const proc = new KLEProcessor(kle_file_name);
proc.process(fs.readFileSync(in_file_name, 'utf-8'));

if(out_file_name) {
	fs.writeFileSync(out_file_name, proc.ksh_result, 'utf-8');
}
if(lua_file_name) {
	fs.writeFileSync(out_file_name, proc.lua_result, 'utf-8');
}