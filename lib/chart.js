const KSHZoom = require("./zoom.js");

const LASER_POS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmno";
const LASER_SLAM_THRESHOLD = 192/32;

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
	toString() {
		return this.modifiers.map((m) => `${m.toString()}\r\n`).join('') + this.line;
	}
}

KSHLine.interpolate = (before, after) => {
	let mx, my;
	mx = (before || '').match(/^(\d\d\d\d)\|(\d\d)\|(..)(.*)$/);
	my = (after || '').match(/^(\d\d\d\d)\|(\d\d)\|(..)(.*)$/);
	if(!mx) throw new Error("Chart line interpolation error!");
	let n = mx[1].replace(/1/g, '0');
	let f = mx[2].replace(/2/g, '0');
	let lx = mx[3], ly = my ? my[3] : '-';
	let r = mx[4];

	const interpolateLaser = (x, y) => x == '-' || y == '-' ? '-' : ':';
	let l = interpolateLaser(lx[0], ly[0]) + interpolateLaser(lx[1], ly[1]);
	return `${n}|${f}|${l}`;
};

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
			let line = new KSHLine(this, [], KSHLine.interpolate(prev_cline.line, next_cline && next_cline.line || ''));
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

		if(raw[0] === '\uFEFF') raw = raw.slice(1);

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
		return "\uFEFF" + this.modifiers.map((m) => m.toString()).join('\r\n') + "\r\n--\r\n" +this.measures.map((m) => m.toString()).join('\r\n') + '\r\n' + this.hash_lines.join('\r\n');
	}
	dumpLuaChart() {
		const timing = [];
		const sections = [];
		const notes = [];
		const lasers = [];

		const measure_infos = [];

		let curr_bpm = 120;
		let offset = 0;
		
		this.modifiers.forEach((mod) => {
			if(mod.startsWith("t=")) curr_bpm = +mod.slice(2);
			else if(mod.startsWith("o=")) offset = +mod.slice(2);
		});
		
		let curr_time = 0;
		let curr_tick = 0;
		let curr_long_notes = [null, null, null, null, null, null];

		let curr_lasers = [null, null];
		let curr_laser_ticks = [0, 0];

		this.measures.forEach((measure, _measure_ind) => {
			measure_infos.push({
				t: curr_time
			});

			let line_inc = measure.length / measure.lines.length;
			measure.lines.forEach((line) => {
				// TODO: process BPM changes
				for(let i of [0, 1, 2, 3, 4, 5]){
					if(curr_long_notes[i]) {
						curr_long_notes[i].l = curr_time - curr_long_notes[i].t;
					}

					const ch = line.line[[0, 1, 2, 3, 5, 6][i]];
					if(ch !== '1' && ch !== '2') {
						curr_long_notes[i] = null;
						continue;
					}

					const is_long = (i < 4 ? ch === '2' : ch === '1');
					if(is_long) {
						if(!curr_long_notes[i]) {
							let note = {'i':i, 't': curr_time, 'l': 0};
							notes.push(note);
							curr_long_notes[i] = note;
						}
					} else {
						const note = {'i': i, 't': curr_time, 'l': 0};
						notes.push(note);
						curr_long_notes[i] = null;
					}
				}

				for(let i of [0, 1]) {
					const ch = line.line[8+i];
					if(ch === ':') continue;
					if(!ch || ch === '-') {
						curr_lasers[i] = null;
						curr_laser_ticks[i] = 0;
						continue;
					}

					const laser_pos = LASER_POS.indexOf(ch);
					if(laser_pos < 0) {
						console.error("Unknown laser position: " + ch);
						continue;
					}
					
					let curr_laser = {'i': i, 't': curr_time, 'p': laser_pos, 'q': laser_pos, 'l': 0};

					if(!curr_lasers[i]) {
						lasers.push(curr_laser);
						curr_lasers[i] = curr_laser;
						curr_laser_ticks[i] = curr_tick;
						continue;
					}

					let prev_laser = curr_lasers[i];
					if(curr_tick <= curr_laser_ticks[i] + LASER_SLAM_THRESHOLD) {
						prev_laser.l = 0;
						prev_laser.q = laser_pos;
						curr_laser.t = prev_laser.t;
					} else {
						prev_laser.l = curr_time - prev_laser.t;
						prev_laser.q = laser_pos;
						curr_laser_ticks[i] = curr_tick;
					}

					lasers.push(curr_laser);
					curr_lasers[i] = curr_laser;
				}

				// 240000 / 192 / BPM = ms per whole note
				curr_tick += line_inc;
				curr_time += (240000/192) * line_inc / curr_bpm;
			});
		});
		
		return (
`-- Timing --
chart_offset = ${offset.toFixed(0)}
chart_measure_times = {${measure_infos.map((o) => o.t.toFixed(0)).join(',')}}

-- Sections --
chart_sections = nil

-- Notes --
chart_notes = {${notes.map((n) => `{${n.i},${n.t.toFixed(0)},${n.l.toFixed(0)}}`).join(',')}}

-- Lasers --
chart_lasers = {${lasers.filter((l) => l.p !== l.q || l.l).map((l) => `{${l.i},${l.t.toFixed(0)},${l.p},${l.q},${l.l.toFixed(0)}}`).join(',')}}

`);
	}
	dumpLuaCalls() {
		return (
`
`);
	}
}

module.exports = KSHChart;
