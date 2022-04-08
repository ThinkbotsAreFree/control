const CTRL = require("./ctrl.js");



let ctrl = new CTRL();


var test;




ctrl.sensor("select numbers", new Set(), function(solution, key, node, previous) {

    if (!node || isNaN(node.value)) solution.delete(key);
    else solution.add(key);
    return solution;
});



ctrl.action("add a link", function(parameters, kb, intm) {

    let n = kb.get(parameters.source);
    let newt = ctrl.node({ who: "destination", value: 22 });
    n.link("test", newt);
    test = newt;
});



let n1 = ctrl.node({ foo: "BarProp", value: 5 });

ctrl.intend("add a link", { source: n1.key() });

ctrl.run();

//console.log("CTRL1", ctrl);
n1.delete();
//console.log("CTRL2", ctrl);

console.log("SENSE:", ctrl.sense("select numbers"));

console.log(test);