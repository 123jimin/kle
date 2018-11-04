const ZOOM_MODS = ['zoom_top', 'zoom_bottom', 'zoom_side'];
const ZOOM_MODS_SET = new Set(ZOOM_MODS);
const fromBack = (arr, ind) => arr[arr.length-(1+ind)];
const clip = (x, low, hi) => x<low ? low : x>hi ? hi : x;

const DEBUG = false;

// TODO: use binary search!
const findIndex = (arr, t) => {
	if(arr.length == 0) return -1;
	if(t < arr[0].t) return -1;
	for(let i=0; i<arr.length-1; i++){
		if(t < arr[i+1].t) return i;
	}
	return arr.length - 1;
};

const interp = (before, after, t) => {
	if(!before) return after.beforeValue();
	if(!after) return before.afterValue();
	r = (t - before.t) / (after.t - before.t);
	return before.afterValue() + (after.beforeValue() - before.afterValue()) * r;
};

const IS_VALID_RANGE = (v) => typeof(v) == 'number' && -10000 <= v && v <= 10000;

const IS_VALID = (mod, edit, patch) => {
	let valid = true;
	if(mod) valid = valid && mod.every((m) => m.isValid());
	if(edit) valid = valid && edit.every((m) => m.isValid());
	if(patch) valid = valid && patch.every((m) => m.isValid());
	return valid;
};

const DUMP = DEBUG ? (type, mod, edit, patch) => {
	if(IS_VALID(mod, edit, patch)) return true;
	console.error("Mod Type", type);
	if(mod){
		console.error("Current Zoom Modifiers:");
		console.error(mod.map((x) => x.toString()).join('\n'));
	}
	if(edit){
		console.error("Current Zoom Edits:");
		console.error(edit.map((x) => x.toString()).join('\n'));
	}
	if(patch){
		console.error("Current Zoom Patches:");
		console.error(patch.map((x) => x.toString()).join('\n'));
	}
	return false;
} : () => true;

class KSHZoomKey {
	constructor(type, t, arr) {
		this.type = type;
		this.t = t;
		this.values = arr;
	}
	merge(that) {
		if(this.values[0] != that.afterValue())
			this.values[1] = that.afterValue();
	}
	isValid() {
		return ZOOM_MODS_SET.has(this.type) &&
			this.t >= 0 && this.t == this.t | 0 &&
			this.values.length >= 1 && this.values.length <= 2 &&
			this.values.every(IS_VALID_RANGE);
	}
	beforeValue() {
		return this.values[0];
	}
	afterValue() {
		return this.values[this.values.length-1];
	}
	setValues(that) {
		this.values = that.values.slice();
	}
	clone() {
		return new KSHZoomKey(this.type, this.t, this.values.slice());
	}
	offset(o) {
		for(let i=0; i<this.values.length; i++) this.values[i] += o;
	}
	offsetKey(that) {
		if(this.isSuddenChange() && that.isSuddenChange()){
			this.values[0] += that.values[0];
			this.values[1] += that.values[1];
			this.simplify();
		}else if(that.isSuddenChange()){
			let before = this.values[0] + that.values[0];
			let after = this.values[0] + that.values[1];
			this.values = [before, after];
		}else{
			this.offset(that.values[0]);
		}
	}
	isSuddenChange() {
		return this.values.length == 2;
	}
	simplify() {
		if(this.isSuddenChange() && this.values[0] == this.values[1]) this.values.pop();
	}
	toString() {
		return `t=${this.t}\t${this.type}\t${this.values.map((v) => Math.round(v)).join(' ')}`;
	}
}

class KSHZoom {
	constructor(chart) {
		this.chart = chart;
		this.mods = {};
		this.edits = {};
		ZOOM_MODS.forEach((MOD_NAME) => {
			this.mods[MOD_NAME] = [];
			this.edits[MOD_NAME] = [];
		});

		this.chart.measures.forEach((measure) => measure.lines.forEach((line) => {
			ZOOM_MODS.forEach((MOD_NAME) => {
				let mod_values = [];
				line.modifiers.forEach((mod) => {
					if(!mod.startsWith(MOD_NAME+'=')) return;
					mod_values.push(+mod.slice(MOD_NAME.length+1));
				});
				if(mod_values.length == 0) return;
				this.mods[MOD_NAME].push(new KSHZoomKey(MOD_NAME, line.t, mod_values));
			});
		}));
	}
	addEdit(type, t, arr) {
		if(!arr.every(IS_VALID_RANGE)) throw new Error(`Invalid edit range for ${type} ${t}! (${arr.toString()})`);
		this.addEditKey(new KSHZoomKey(type, t, arr));
	}
	addEditKey(key) {
		let edit_arr = this.edits[key.type];
		if(edit_arr.length){
			let last_edit = fromBack(edit_arr, 0);
			if(last_edit.t == key.t) {
				last_edit.merge(key);
			}else if(last_edit.t > key.t){
				throw new Error("Invalid edit key order!");
			}
		}
		edit_arr.push(key);
	}
	// Applies edits to the mod
	applyEdits() {
		ZOOM_MODS.forEach((MOD_NAME) => {
			let mod_arr = this.mods[MOD_NAME];
			let edit_arr = this.edits[MOD_NAME];

			if(edit_arr.length == 0) return;

			// Set the first and last offset to zero
			if(edit_arr[0].isSuddenChange()) edit_arr[0].values[0] = 0;
			else edit_arr[0].values.unshift(0);

			let last_edit_elem = fromBack(edit_arr, 0);
			if(last_edit_elem.isSuddenChange()) last_edit_elem.values[1] = 0;
			else last_edit_elem.values.push(0);

			edit_arr[0].simplify();
			last_edit_elem.simplify();

			if(mod_arr.length == 0){
				edit_arr.forEach((key) => mod_arr.push(key));
				this.edits[MOD_NAME] = [];
				return;
			}

			const first_apply_index = findIndex(mod_arr, edit_arr[0].t);
			let mod_before = first_apply_index;
			let patches = [];

			// Computes values
			edit_arr.forEach((edit_key, ind) => {
				while(mod_before+1 < mod_arr.length && mod_arr[mod_before+1].t <= edit_key.t){
					let mod_key = mod_arr[++mod_before];
					if(mod_key.t == edit_key.t) break;
					let new_mod_key = mod_key.clone();
					new_mod_key.offset(interp(edit_arr[ind-1], edit_key, new_mod_key.t));
					patches.push(new_mod_key);
				}
				// Put edit_key into patches
				let new_edit_key = edit_key.clone();
				// Two coincides (can happen at the beginning)
				if(mod_before >= 0 && mod_before < mod_arr.length && new_edit_key.t == mod_arr[mod_before].t){
					new_edit_key.offsetKey(mod_arr[mod_before]);
				}else{
					new_edit_key.offset(interp(mod_arr[mod_before], mod_arr[mod_before+1], edit_key.t));
				}
				patches.push(new_edit_key);
			});

			// Check that everything went smoothly.
			if(!DUMP(MOD_NAME, mod_arr, edit_arr, patches)){
				throw new Error("Invalid patch!");
			}

			// Applies patches
			mod_before = first_apply_index;
			patches.forEach((patch) => {
				while(mod_before+1 < mod_arr.length && mod_arr[mod_before+1].t <= patch.t) mod_before++;
				if(mod_before == -1){
					mod_arr.unshift(patch);
					mod_before++;
					return;
				}
				if(mod_before == mod_arr.length){
					mod_arr.push(patch);
					mod_before++;
					return;
				}
				let mod_key = mod_arr[mod_before];
				if(mod_key.t == patch.t){
					mod_key.setValues(patch);
				}else if(mod_before == mod_arr.length-1){
					mod_arr.push(patch);
					mod_before++;
				}else{
					mod_arr.splice(mod_before+1, 0, patch);
					mod_before++;
				}
			});

			this.edits[MOD_NAME] = [];
		});
	}
	// Applies mods to the chart
	apply() {
		this.applyEdits();
		ZOOM_MODS.forEach((MOD_NAME) => {
			this.mods[MOD_NAME].forEach((mod) => {
				this.chart.makeLine(mod.t);
				let line = this.chart.lines[mod.t];
				// Remove previous modifiers
				line.modifiers = line.modifiers.filter((m) => !m.startsWith(`${MOD_NAME}=`));
				mod.simplify();
				mod.values.map((v, i) => {
					const orig_v = v;
					if(i == 0) v = clip(v, -300, 300);
					else v = clip(v, -999, 999);
					if(v != orig_v){
						console.error(`Warning: [t=${mod.t}] ${MOD_NAME} out of bounds (${orig_v})`);
					}
					return Math.round(v);
				}).forEach((v) => line.modifiers.push(`${MOD_NAME}=${v}`));
			});
		});
	}
}

KSHZoom.ZOOM_MODS = ZOOM_MODS;

module.exports = KSHZoom;
