class KLENull {
	constructor() {
	}
	execute(ksh, t, args) {
		return [];
	}
}

class KLEError {
	constructor() {
	}
	execute(ksh, t, args) {
		console.error("(KLE) [t="+t+"] "+args.join(' '));
		throw new Error("An error was triggered!");
	}
}

class KLEPrint {
	constructor() {
	}
	execute(ksh, t, args) {
		console.log("(KLE) [t="+t+"] "+args.join(' '));
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

module.exports = {
	'KLECommandZoom': KLECommandZoom,
	'zoom_top': new KLECommandZoom('zoom_top'),
	'zoom_bottom': new KLECommandZoom('zoom_bottom'),
	'zoom_side': new KLECommandZoom('zoom_side'),

	'comment': new KLENull(),
	'null': new KLENull(),

	'error': new KLEError(),
	'err': new KLEError(),
	// 'throw' and 'raise' might be used as a verb lol

	'print': new KLEPrint()
};
