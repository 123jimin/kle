const KSHChart = require("./chart.js");
const KLEScript = require("./script.js");

class KLEProcessor {
	kle = null;
	ksh_result = '';
	lua_result = '';
	constructor(kle_script){
		this.kle = KLEScript.fromFilePath(process.cwd(), kle_script);
	}
	process(ksh_chart, metadata_override){		
		console.log("Parsing chart file...");
		this.ksh = new KSHChart(ksh_chart);
		
		if(metadata_override) {
			for(let i=0; i<this.ksh.modifiers.length; ++i) {
				const key = this.ksh.modifiers[i].split('=')[0];
				if(key in metadata_override) this.ksh.modifiers[i] = `${key}=${metadata_override[key]}`;
			}
		}
		
		console.log("Applying scripts...");
		this.kle.process(this.ksh);
		
		console.log("Generating lua chart...");
		this.lua_result =
`--------------------
-- Chart Contents --
--------------------

${this.ksh.dumpLuaChart()}
`;
		
		console.log("Generating ksh...");
		this.ksh_result = this.ksh.toString();
		
		/*
		console.log("Generating lua calls...");
		this.lua_result +=
`------------------
-- Script Calls --
------------------

${this.ksh.dumpLuaCalls()}`;
		*/
	}
}

module.exports = KLEProcessor;
