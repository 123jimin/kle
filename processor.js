const KSHChart = require("./chart.js");
const KLEScript = require("./script.js");

class KLEProcessor {
	constructor(kle_script){
		this.kle = new KLEScript(kle_script);
	}
	process(ksh_chart){
		console.log("Parsing chart file...");
		this.ksh = new KSHChart(ksh_chart);
		console.log("Applying scripts...");
		this.kle.process(this.ksh);
		return this.ksh.toString();
	}
}

module.exports = KLEProcessor;
