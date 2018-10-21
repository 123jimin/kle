const ZOOM_MODS = require("./zoom.js").ZOOM_MODS;

const SCRIPT_ALIAS = {
	'define': 'command',
	'include': 'import',
	'line': 'tick',
};
class KLENode {
	constructor(name, args, line) {
		this.raw_name = name;
		this.name = name.toLowerCase();
		// Handle alias
		if(this.name in SCRIPT_ALIAS ) this.name = SCRIPT_ALIAS[this.name];
		switch(this.name){
			case 'else':
				this.end_name = 'if';
				break;
			default:
				this.end_name = this.raw_name;
		}

		this.args = args;
		this.line_no = line || 0;
		this.children = [];
	}
	toString() {
		return `[${this.raw_name} at line ${this.line_no}]`
	}
	dump() {
		const indenter = "  ";
		const lines = [];
		let dumpIndent = (indent, node) => {
			lines.push(indent + node.toString());
			node.children.forEach((child) => dumpIndent(indent + indenter, child));
		};
		dumpIndent('', this);
		return lines.join('\n');
	}
}

class KLEParser {
	constructor() {

	}
	parse(raw) {
		let root = new KLENode('script', [], 1);
		let stack = [root];
		raw.split('\n').forEach((line, line_no) => {
			line = line.replace(/[\t\r\v]/g, ' ').replace(/\s\s+/g, ' ');
			line = line.replace(/(\/\/|\#).+$/, '').trim();
			if(!line) return;

			let line_arr = line.split(' ');
			if(line_arr[0][0] == ';' && line_arr[0] != ';'){
				line_arr[0] = line_arr[0].slice(1);
				line_arr.unshift(';');
			}

			if(stack.length == 0) throw new Error("Stack is empty!");
			let stackTop = stack[stack.length-1];

			if(line_arr[0] == ';'){
				if(line_arr.length == 1) throw new Error(`Missing command! [line ${line_no+1}]`);
				let node = new KLENode(line_arr[1], line_arr.slice(2), line_no+1);
				stackTop.children.push(node);
				// Block management
				switch(node.name){
					case 'repeat':
					case 'command':
					case 'while':
					case 'if':
						stack.push(node);
						break;
					case 'else':
						stack.pop();
						stack.push(node);
						break;
					case 'end':
						if(stack.length == 1) throw new Error(`Unmatched 'end'! [line ${node.line_no}]`);
						stack.pop();
						if(line_arr[2] && line_arr[2] != stackTop.end_name){
							throw new Error(`Unmatched 'end'! (Tried to pop '${line_arr[2]}' but found '${stackTop.end_name}' instead.) [line ${stackTop.line_no}..${node.line_no}]`);
						}
						break;
					default:
				}
				return;
			}
			if(line == '@' || line.match(/^\d\d\d\d\|\d\d\|../)) {
				stackTop.children.push(new KLENode('tick', [line], line_no+1));
				return;
			}
			// converts `zoom_foo = bar` to command form
			let is_zoom_mod = false;
			ZOOM_MODS.forEach((MOD_NAME) => {
				if(is_zoom_mod) return;
				if(!line.startsWith(MOD_NAME)) return;
				let line_part = line.slice(MOD_NAME.length).trimLeft();
				if(!line_part.startsWith('=')) return;
				let line_arr = line_part.slice(1).trim().split(' ');
				stackTop.children.push(new KLENode(MOD_NAME, line_arr, line_no+1));
				is_zoom_mod = true;
			});
			if(is_zoom_mod) return;
			throw new Error(`Unknown command found! [line ${line_no+1}]`);
		});
		if(stack.length > 1) throw new Error(`Unterminated ${stack[stack.length-1].name} node! [from line ${stack[stack.length-1].line_no}]`);
		return root;
	}
}

module.exports = KLEParser;
