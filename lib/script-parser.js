const ZOOM_MODS = require("./zoom.js").ZOOM_MODS;
const MATCHING_PARENS = {
	'(': ')', '{': '}', '[': ']',
	')': '(', '}': '{', ']': '['
}
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
	splitArgList(s) {
		let a = [];
		let start = 0;
		let inToken = false;
		let parenStack = [];
		for(let i=0; i<s.length; i++){
			const c = s[i];
			switch(c){
				case ' ': case '\t': case '\v': case '\r':
					if(inToken && parenStack.length == 0){
						a.push(s.slice(start, i));
						inToken = false;
					}
					break;
				case '(': case '{': case '[':
					if(!inToken){
						inToken = true;
						start = i;
					}
					parenStack.push(c);
					break;
				case ')': case '}': case ']':
					if(parenStack.length == 0) throw new Error("Unmatched parens!");
					if(parenStack.pop() != MATCHING_PARENS[c])
						throw new Error("Unmatched parens!");
					break;
				default:
					if(!inToken){
						inToken = true;
						start = i;
					}
			}
		}
		if(parenStack.length != 0){
			throw new Error("Unmatched parens!");
		}
		if(inToken) a.push(s.slice(start));
		return a;
	}
	parse(raw) {
		let root = new KLENode('script', [], 1);
		let stack = [root];
		raw.split('\n').forEach((line, line_no) => {
			line = line.replace(/[\t\r\v]/g, ' ').replace(/\s\s+/g, ' ');
			line = line.replace(/(\/\/|\#).+$/, '').trim();
			if(!line) return;

			let is_statement = line[0] == ';';

			if(stack.length == 0) throw new Error("Stack is empty!");
			let stackTop = stack[stack.length-1];

			if(is_statement){
				let statement_args = [];
				if(is_statement){
					// Parse arguments
					try{
						statement_args = this.splitArgList(line.slice(1).trimLeft());
					}catch(e){
						e.message += ` [line ${line_no+1}]`;
						throw e;
					}
				}
				if(statement_args.length == 0) throw new Error(`Missing command! [line ${line_no+1}]`);
				let node = new KLENode(statement_args[0], statement_args.slice(1), line_no+1);
				// Block management
				switch(node.name){
					case 'repeat':
					case 'command':
					case 'while':
					case 'if':
						stackTop.children.push(node);
						stack.push(node);
						break;
					case 'else':
						stack.pop();
						if(stack.length == 0) throw new Error(`Isolated 'else'! [line ${node.line_no}]`);
						stack[stack.length-1].children.push(node);
						stack.push(node);
						break;
					case 'end':
						if(stack.length == 1) throw new Error(`Unmatched 'end'! [line ${node.line_no}]`);
						stack.pop();
						if(statement_args[1] && statement_args[1] != stackTop.end_name){
							throw new Error(`Unmatched 'end'! (Tried to pop '${statement_args[1]}' but found '${stackTop.end_name}' instead.) [line ${stackTop.line_no}..${node.line_no}]`);
						}
						break;
					default:
						stackTop.children.push(node);
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
