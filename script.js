const ZOOM_MODS = require("./zoom.js").ZOOM_MODS;
const KSHChart = require("./chart.js");

const parseBeat = (str) => {
	let [a, b] = str.split('/');
	return (+a * 192) / (+b);
};

const INVALID_COMMAND_NAMES = {
	'define': true, 'command': true, 'end': true, 'set': true, 'null': true, 'comment': true,
};
ZOOM_MODS.forEach((MOD_NAME) => INVALID_COMMAND_NAMES[MOD_NAME] = true);

// Does nothing
class KLENull {
	constructor() {
	}
	execute(ksh, t, args) {
		return [];
	}
}

class KLECommandZoom {
	constructor(mod) {
		this.mod = mod;
	}
	execute(ksh, t, args){
		let edit_type = 'delta';
		switch(args[0].toLowerCase()){
			case 'delta':
				edit_type = args.shift().toLowerCase();
				break;
		}
		ksh.zoom.addEdit(this.mod, t, args.map((n) => +n));
		return [];
	}
}

class KLECommand {
	constructor(lines) {
		let header = lines[0].slice(2);
		let body = lines.slice(1);

		this.name = header[0];
		if(this.name in INVALID_COMMAND_NAMES)
			throw new Error(`Invalid command name "${this.name}"!`);

		this.arg_names = header.slice(1);
		this.body = body.map((l) => {
			if(l[0].match(/^\d\d\d\d\|\d\d\|../)) return ['@'];
			let to_return = null;
			// converts `zoom_foo = bar` to command form
			ZOOM_MODS.forEach((MOD_NAME) => {
				if(to_return) return;
				if(l[0] != MOD_NAME && !l[0].startsWith(MOD_NAME+'=')) return;
				to_return = [';', MOD_NAME];
				l.join(' ').split('=').slice(1).join('=').trim().split(' ').forEach((token) => to_return.push(token));
			});
			return to_return || l;
		});
		this.length = this.body.filter((l) => l[0] == '@').length;

		if(this.arg_names.some((n) => n[0] != '$'))
			throw new Error(`Invalid command arg definition for command "${this.name}"!`);
	}
	calc(context, eq) {
		if(eq.match(/^[A-Z_][A-Z0-9\-_]*$/i)) return eq;

		eq = eq.replace(/\$([a-z0-9\-_]+)/ig, (vn, id) => {
			if(vn in context) return `(${context[vn]})`;
			else return vn;
		});

		if(eq.match(/[^0-9().+\-*/]/))
			throw new Error(`Invalid expression for command "${this.name}"!`);

		// Just eval it (spooky)
		return ''+eval(eq);
	}
	putChartVars(ksh, t, context) {
		ksh.makeLine(t);
		const line = ksh.lines[t];
		if(!line) return;

		ZOOM_MODS.forEach((MOD_NAME) => {
			// context['$'+MOD_NAME] = ''+fromBack(line.zooms[MOD_NAME], 0)
		});
	}
	execute(ksh, t, args) {
		let more_commands = [];
		let curr_t = t;
		let context = {};

		this.arg_names.forEach((n, i) => {
			let na = n.split('=');
			if(i < args.length) context[na[0]] = +args[i];
			else context[na[0]] = +na[1];
		});

		let effect_length = +args[0];

		this.body.forEach((line) => {
			if(line[0] == '@'){
				if(this.length == 0 || effect_length % this.length != 0)
					throw new Error(`Invalid timing when applying command "${this.name}" on t=${t}!`);
				curr_t += effect_length / this.length;
			}
			if(line[0] == ';'){
				this.putChartVars(ksh, curr_t, context);
				switch(line[1]){
					case 'set':
						if(line[2][0] == '$') {
							context[line[2]] = this.calc(context, line[3]);
						}
						break;
					default:
						more_commands.push([curr_t, line[1], line.slice(2).map((s) => this.calc(context, s))]);
				}
			}
		});
		return more_commands;
	}
}

class KLEScript {
	constructor(raw) {
		this.commands = {
			'zoom_top': new KLECommandZoom('zoom_top'),
			'zoom_bottom': new KLECommandZoom('zoom_bottom'),
			'zoom_side': new KLECommandZoom('zoom_side'),

			'comment': new KLENull(),
			'null': new KLENull()
		};

		let buffer = [];
		let in_command = false;
		raw.split('\n').forEach((line) => {
			line = line.replace(/\/\/.+$/, '').trim();
			if(!line) return;
			line = line.replace(/[\t\r\v]/g, ' ').replace(/\s\s+/g, ' ');
			let line_arr = line.split(' ');
			if(line_arr[0][0] == ';' && line_arr[0] != ';'){
				line_arr[0] = line_arr[0].slice(1);
				line_arr.unshift(';');
			}

			if(line_arr[0] == ';'){
				switch(line_arr[1]){
					case 'command':
					case 'define':
						in_command = true;
						buffer = [];
						break;
					case 'end':
						let command = new KLECommand(buffer);
						this.commands[command.name] = command;
						in_command = false;
						buffer = [];
						break;
				}
			}
			if(in_command) buffer.push(line_arr);
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
		ksh.makeLine(t);

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
			if(this.commands[command] instanceof KLECommandZoom){
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

module.exports = KLEScript;
