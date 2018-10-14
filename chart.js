const KSHZoom = require("./zoom.js");

const GCD = (a, b) => b == 0 ? a : GCD(b, a%b);
const parseBeat = (str) => {
	let [a, b] = str.split('/');
	return (+a * 192) / (+b);
};

class KSHLine {
	constructor(measure, mods, line) {
		this.measure = measure;
		this.modifiers = mods;
		this.line = line;
		this.t = 0;
	}
	extendLine() {
		let m;
		if(m = this.line.match(/^(\d\d\d\d)\|(\d\d)\|(..)(.*)$/)){
			let n = m[1].replace(/1/g, '0');
			let f = m[2].replace(/2/g, '0');
			let l = m[3];
			let r = m[4];
			return `${n}|${f}|${l}`;
		}
		return this.line;
	}
	toString() {
		return this.modifiers.map((m) => `${m.toString()}\r\n`).join('') + this.line;
	}
}

class KSHMeasure {
	constructor(chart, prev_len, raw_lines) {
		this.chart = chart;
		this.length = prev_len;
		this.lines = [];

		let curr_mods = [];
		raw_lines.forEach((line) => {
			if(line.match(/^\d\d\d\d\|\d\d\|../)){
				this.lines.push(new KSHLine(this, curr_mods, line));
				curr_mods = [];
			}else{
				if(this.lines.length == 0){
					if(line.startsWith("beat=")){
						this.length = parseBeat(line.slice(5));
					}
				}
				curr_mods.push(line);
			}
		});

		if(this.length % this.lines.length != 0) throw new Error(`Measure line mismatch! (${this.length} / ${this.lines.length})`);
	}
	fine(t) {
		if(this.length == 0 || this.lines.length == 0) return;
		t -= this.lines[0].t;
		t %= this.length;
		t = GCD(t, this.length / this.lines.length);
		let new_lines = [];
		let next_cind = 0;
		let next_cline = this.lines[0];
		let prev_cline = this.lines[0];
		for(let i=this.lines[0].t; i<this.lines[0].t+this.length; i+=t){
			if(next_cline){
				if(next_cline.t == i){
					new_lines.push(next_cline);
					prev_cline = next_cline;
					if(++next_cind < this.lines.length)
						next_cline = this.lines[next_cind];
					else
						next_cline = this.chart.lines[i + this.length / this.lines.length];
					continue;
				}
			}
			let line = new KSHLine(this, [], prev_cline.extendLine());
			line.t = i;
			new_lines.push(line);
			this.chart.lines[line.t] = line;
		}
		this.lines = new_lines;
	}
	toString() {
		return this.lines.map((l) => l.toString()).join('\r\n') + "\r\n--";
	}
}

class KSHChart {
	constructor(raw) {
		this.modifiers = [];
		this.measures = [];
		this.hash_lines = [];

		this.lines = [];

		let before_1st_measure = true;
		let buffer_lines = [];
		let curr_measure_len = 192;

		raw.split('\n').forEach((line) => {
			line = line.trim();
			if(line[0] == '#'){
				this.hash_lines.push(line);
				return;
			}
			if(line == '--'){
				if(before_1st_measure){
					before_1st_measure = false;
				}else{
					let measure = new KSHMeasure(this, curr_measure_len, buffer_lines);
					this.measures.push(measure);
					curr_measure_len = measure.length;
					buffer_lines = [];
				}
				return;
			}
			if(before_1st_measure) this.modifiers.push(line);
			else buffer_lines.push(line);
		});

		let curr_t = 0;
		this.measures.forEach((measure) => {
			measure.lines.forEach((line) => {
				line.t = curr_t;
				curr_t += measure.length / measure.lines.length;
				this.lines[line.t] = line;
			});
		});

		this.zoom = new KSHZoom(this);
	}
	makeLine(t) {
		if(t in this.lines) return true;
		let last_measure = null;
		this.measures.forEach((measure) => {
			if(measure.lines.length == 0) return;
			if(measure.lines[0].t > t) return;
			last_measure = measure;
		});
		if(last_measure == null)
			throw new Error("Failed to find a measure to fine!");
		last_measure.fine(t);
		return (t in this.lines);
	}
	toString() {
		return this.modifiers.map((m) => m.toString()).join('\r\n') + "\r\n--\r\n" +this.measures.map((m) => m.toString()).join('\r\n') + '\r\n' + this.hash_lines.join('\r\n');
	}
}

module.exports = KSHChart;
