const KSHChart = require("./chart.js");
const KLEScript = require("./script.js");

class KLEProcessor {
	kle = null;
	ksh_result = '';
	lua_result = '';
	constructor(kle_script){
		this.kle = KLEScript.fromFilePath(process.cwd(), kle_script);
	}
	process(ksh_chart){
		console.log("Parsing chart file...");
		this.ksh = new KSHChart(ksh_chart);
		
		console.log("Applying scripts...");
		this.kle.process(this.ksh);
		
		this.ksh_result = this.ksh.toString();
	}
}

module.exports = KLEProcessor;
