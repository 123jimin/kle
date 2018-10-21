const path = require('path');
const fs = require('fs');
const ZOOM_MODS = require("./zoom.js").ZOOM_MODS;
const KSHChart = require("./chart.js");
const scriptLib = require("./script-lib.js");
const KLEParser = require("./script-parser.js");

const parseBeat = (str) => {
	let [a, b] = str.split('/');
	return (+a * 192) / (+b);
};

const INVALID_COMMAND_NAMES = new Set([
	'define', 'command', 'end', 'set', 'import', 'include', 'script',
	'if', 'else', 'while', 'for', 'switch', 'line', 'tick', 'repeat',
]);
ZOOM_MODS.forEach((MOD_NAME) => INVALID_COMMAND_NAMES.add(MOD_NAME));
for(let k in scriptLib) INVALID_COMMAND_NAMES.add(k);

class KLECommand {
	constructor(node) {
		if(node.name != 'command') throw new Error(`Invalid node for command!`);
		this.root = node;
		this.name = node.args[0];
		this.arg_names = node.args.slice(1);

		if(INVALID_COMMAND_NAMES.has(this.name))
			throw new Error(`Invalid command name "${this.name}"! [${node.toString()}]`);

		if(this.arg_names.some((n) => n[0] != '$'))
			throw new Error(`Invalid command arg definition found! [${node.toString()}]`);
	}
	calc(context, eq) {
		const orig_eq = eq;
		if(eq.match(/^[A-Z_][A-Z0-9\-_]*$/i)) return eq;

		eq = eq.replace(/\$([a-z0-9\-_]+)/ig, (vn, id) => {
			if(vn in context) return `(${context[vn]})`;
			else return vn;
		});

		if(eq.match(/[^0-9().+\-*!=<>/%]/))
			throw new Error(`Invalid expression (${orig_eq}) in command "${this.name}"! ${this.root.toString()}`);

		// Just eval it (spooky)
		return ''+eval(eq);
	}
	evaluate(context, node) {
		let exec_arr = [];
		for(let i=0; i<node.children.length; i++){
			let args;
			let child = node.children[i];
			switch(child.name){
				case 'command':
					throw new Error(`Tried to define a command in another command! ${child.toString()}`);
					break;
				case 'else':
					throw new Error(`Invalid statement found! ${child.toString()}`);
					break;
				case 'tick':
					exec_arr.push(['tick', null]);
					break;
				case 'set':
					if(child.args.length != 2 || child.args[0][0] != '$'){
						throw new Error(`Invalid set statement! ${child.toString()}`);
					}
					context[child.args[0]] = this.calc(context, child.args[1]);
					break;
				case 'if':
					let curr_child = child;
					let skip = false;
					while(true){
						if(!skip){
							let exec_flag = false;
							if(curr_child.name == 'if'){
								if(curr_child.args.length != 1)
									throw new Error(`Invalid if statement! ${curr_child.toString()}`);
								exec_flag = this.calc(context, curr_child.args[0]);
							}else{
								if(curr_child.args.length == 0) exec_flag = true;
								else{
									if(curr_child.args.length != 2 || curr_child.args[0].toLowerCase() != 'if')
										throw new Error(`Invalid else statement! ${curr_child.toString()}`);
									exec_flag = this.calc(context, curr_child.args[1]);
								}
							}
							if(exec_flag){
								exec_arr = exec_arr.concat(this.evaluate(context, curr_child));
								skip = true;
							}
						}
						if(curr_child.name == 'else' && curr_child.args.length == 0) break;
						if(i+1 == node.children.length) break;
						let curr_child = node.children[i+1];
						if(curr_child.name != 'else') break;
						i++;
					}
					break;
				default:
					args = child.args.map((a) => this.calc(context, a));
					exec_arr.push([child.name, args]);
			}
		}
		return exec_arr;
	}
	execute(ksh, t, args) {
		let more_commands = [];
		let context = {};

		this.arg_names.forEach((n, i) => {
			let na = n.split('=');
			if(i < args.length) context[na[0]] = +args[i];
			else context[na[0]] = +na[1];
		});

		const effect_length = +args[0];
		let exec_arr = this.evaluate(context, this.root);
		let line_count = 0;
		exec_arr.forEach(([name, args]) => {
			if(name == 'tick') line_count++;
			else more_commands.push([line_count, name, args]);
		});

		if(line_count > 0 && effect_length % line_count != 0){
			throw new Error(`Length(${effect_length}) not divisible by line count(${line_count})! ${this.root.toString()}`);
		}

		const tick_t = line_count > 0 ? effect_length / line_count : 1;
		return more_commands.map(([nt, name, args]) => {
			return [t + tick_t*nt, name, args];
		});
	}
}

class KLEScript {
	constructor(base_dir, raw) {
		this.base_dir = base_dir;
		this.commands = {};
		for(let k in scriptLib) this.commands[k] = scriptLib[k];

		const parser = new KLEParser();
		let buffer = [];
		let in_command = false;

		this.root = parser.parse(raw);
		this.init(this.root);
	}
	init(node) {
		node.children.forEach((child) => {
			switch(child.name){
				case 'import':
					const script = KLEScript.fromFilePath(this.base_dir, child.args.join(' '));
					for(let k in script.commands) this.commands[k] = script.commands[k];
					break;
				case 'command':
					const command = new KLECommand(child);
					this.commands[command.name] = command;
					break;
				default:
					throw new Error(`Invalid top level statement found! ${child.toString()}`);
			}
		});
	}
	process(ksh) {
		let commands = [];
		ksh.measures.forEach((measure) => {
			measure.lines.forEach((line) => {
				line.modifiers.forEach((mod) => {
					if(mod[0] != ';') return;
					let cmd_line = mod.slice(1).trim().split(' ');
					commands.push([line.t, cmd_line[0], cmd_line.slice(1)]);
				});
			});
		});
		commands.forEach(([t, command, args]) => {
			this.applyCommand(ksh, t, command, args);
		});
		ksh.zoom.apply();
	}
	applyCommand(ksh, t, command, args) {
		if(!(command in this.commands)) return;

		args = args.map((v) => {
			let m;
			if(m=v.match(/^\{(\d+)\/(\d+)\}$/)){
				return 192*+m[1]/+m[2];
			}
			return v;
		});

		let commands_to_execute = this.commands[command].execute(ksh, t, args);
		let others_to_execute = [];

		// Execute zoom commands first before going deeper!
		let hasZoom = false;
		commands_to_execute = commands_to_execute.filter(([t, command, args]) => {
			if(!(command in this.commands)) return false;
			if(this.commands[command] instanceof scriptLib.KLECommandZoom){
				this.applyCommand(ksh, t, command, args);
				hasZoom = true;
				return false;
			}
			return true;
		});

		// Apply zoom changes.
		if(hasZoom) ksh.zoom.applyEdits();

		commands_to_execute.forEach(([t, command, args]) => this.applyCommand(ksh, t, command, args));
	}
}

const SCRIPT_CACHE = {};

KLEScript.fromFilePath = (base_dir, p) => {
	if(p == 'stdlib') return SCRIPT_CACHE['stdlib'];
	let ap = path.resolve(base_dir, p);
	if(ap in SCRIPT_CACHE) return SCRIPT_CACHE[ap];
	return SCRIPT_CACHE[ap] = new KLEScript(path.dirname(ap), fs.readFileSync(ap, 'utf-8'));
};

SCRIPT_CACHE['stdlib'] = new KLEScript(__dirname, fs.readFileSync(path.resolve(__dirname, "stdlib.kle"), 'utf-8'));

module.exports = KLEScript;
