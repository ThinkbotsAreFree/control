


/* Helpers
 *
 */



function jsonify(o) { return JSON.parse(JSON.stringify(o)); }



/* Sensitive Maps
 *
 */



class SMap extends Map {

    sensors = {};

    constructor(ctrl, content) {
        super();
        this.ctrl = ctrl;
        if (content)
            for (let [k, v] of content) this.set(k, v);
    }

    sense(id) {
        return this.sensors[id].solution;
    }

    removeSensor(id) {
        delete this.sensors[id];
        return this;
    }

    sensor(id, initial, reducer) {
        this.sensors[id] = { reducer, solution: initial };
        this.forEach((value, key) => {
            this.sensors[id].solution =
                this.sensors[id].reducer(
                    this.sensors[id].solution,
                    key,
                    value
                )
        });
        return this;
    }

    touch(key, previous) {
        for (let s in this.sensors)
            this.sensors[s].solution =
                this.sensors[s].reducer(
                    this.sensors[s].solution,
                    key,
                    this.get(key),
                    previous
                );
        return this;
    }

    set(...args) {
        let previous = this.get(args[0]);
        let result = super.set(...args);
        this.touch(args[0], previous);
        return result;
    }

    delete(...args) {
        let previous = this.get(args[0]);
        let result = super.delete(...args);
        this.touch(args[0], previous);
        return result;
    }
}



/* Linked Knowledge base
 *
 */



class LinkedKnowledge {

    constructor(ctrl, store) {
        Object.assign(this, { ctrl, store });
        this.fresh = (function () {
            let id = 0n;
            return function (prefix) {
                return prefix.toString() + (id++);
            }
        })();
    }

    calculateKey(path, id) {
        return path.join('/') + '/' + id;
    }

    explodeKey(key) {
        let path = key.split('/');
        let id = path.pop();
        return { "@id": id, "@path": path };
    }

    key(o) {
        return this.calculateKey(o["@path"], o["@id"]);
    }

    timestamp(o) {
        Object.assign(o, { "@date": Date.now() });
        return this;
    }

    blankNode() {
        return {
            "@id": this.fresh("Node"),
            "@path": ["global"],
            "@date": Date.now(),
            "@doc": "https://aidreams.co.uk",
            "@out": {
                "@isa": new Set(),
                "@gen": new Set()
            },
            "@in": {
                "@isa": new Set(),
                "@gen": new Set()
            },
        }
    }

    node(properties = {}) {
        return (new Node(properties, this)).save();
    }

    get(key) {
        return new Node(this.store.get.call(this.store, key), this);
    }

    link(source, vector, target) {
        this.addRef(source["@out"], vector, target);
        this.addRef(target["@in"], vector, source);
        source.save();
        target.save();
        return this;
    }

    addRef(host, vector, target) {
        if (!host[vector]) host[vector] = new Set();
        host[vector].add(target.key());
        return this;
    }

    unlink(source, vector, target) {
        this.delRef(source["@out"], vector, target);
        this.delRef(target["@in"], vector, source);
        source.save();
        target.save();
        return this;
    }

    delRef(host, vector, target) {
        if (!host[vector]) return this;
        host[vector].delete(target.key());
        if (!host[vector].size) delete host[vector];
        return this;
    }
}



/* Knowledge Node
 *
 */



class Node {

    constructor(properties, knowledgeBase) {
        this["@kb"] = knowledgeBase;
        Object.assign(this, this["@kb"].blankNode(), properties);
    }

    save() {
        this["@kb"].store.set.call(
            this["@kb"].store,
            this["@kb"].key(this),
            this
        );
        return this;
    }

    delete() {
        this.isolate();
        this["@kb"].store.delete(this.key());
    }

    isolate() {
        for (let vec in this["@out"])
            for (let target of this["@out"][vec])
                this["@kb"].unlink(this, vec, this["@kb"].get(target));
        for (let vec in this["@in"])
            for (let target of this["@in"][vec])
                this["@kb"].unlink(this["@kb"].get(target), vec, this);
        return this;
    }

    assign(data, allowReservedKey) {
        if (!allowReservedKey)
            for (let property of Object.keys(data))
                if (property[0] === '@')
                    throw "assign reserved key";
        Object.assign(this, jsonify(data));
        this.save();
        return this;
    }

    id() {
        return this["@id"];
    }

    path() {
        return this["@path"];
    }

    date() {
        return this["@date"];
    }

    doc(url) {
        if (url) {
            this["@doc"] = url;
            return this;
        }
        return this["@doc"];
    }

    key() {
        return this["@kb"].key(this);
    }

    link(vector, target, allowReservedKey) {
        if (!allowReservedKey && vector[0] === '@')
            throw "link reserved key";
        this["@kb"].link(this, vector, target);
        return this;
    }

    unlink(vector, target, allowReservedKey) {
        if (!allowReservedKey && vector[0] === '@')
            throw "unlink reserved key";
        this["@kb"].unlink(this, vector, target);
        return this;
    }

    linksOut(vector) {
        return this["@out"][vector];
    }

    linksIn(vector) {
        return this["@in"][vector];
    }

    isa(...classes) {
        if (classes.length) {
            for (let c of classes) this.link("@isa", c, true);
            return this;
        } else
            return this["@out"]["@isa"];
    }

    nisa(...classes) {
        if (classes.length)
            for (let c of classes) this.unlink("@isa", c, true);
        return this;
    }

    gen(...classes) {
        if (classes.length) {
            for (let c of classes) this.link("@gen", c, true);
            return this;
        } else
            return this["@out"]["@gen"];
    }

    ngen(...classes) {
        if (classes.length)
            for (let c of classes) this.unlink("@gen", c, true);
        return this;
    }

    focus() {
        this["@kb"].ctrl.focusManager.focus(this.key());
    }

    blur() {
        this["@kb"].ctrl.focusManager.blur(this.key());
    }
}



/* Intent Manager
 *
 */



class IntentManager {

    intentions = [];
    target = null;
    actions = {};
    intentID = 0n;

    constructor(ctrl, target) {
        Object.assign(this, { ctrl, target });
    }

    intend(action, parameters) {
        let id = 'i' + (this.intentID++);
        this.intentions.push({ action, parameters, id });
        return id;
    }

    action(id, handler) {
        this.actions[id] = handler;
    }

    execute(intent) {
        return this.actions[intent.action].call(this, intent.parameters, this.target, this);
    }

    run() {
        let intentList = Array.from(this.intentions);
        this.intentions = [];
        let result = {};
        for (let intent of intentList)
            result[intent.id] = { intent, result: this.execute(intent) };
        return result;
    }
}



/* Focus Manager
 *
 */



class FocusManager {

    interest = new Set();

    constructor(ctrl, kb) {
        Object.assign(this, { ctrl, kb });
    }

    focus(key) {
        this.interest.add(key);
    }

    blur(key) {
        this.interest.delete(key);
    }

    gather() {
        return this.interest.map(key => kb.get(key));
    }
}



/* Kanban Card
 *
 */



class Card {

    deck = new Set();
    values = new Set();

    constructor(ctrl, parent, task) {
        Object.assign(this, { ctrl, parent, task });
    }

    card(task) {
        let card = new Card(this.ctrl, this, task);
        this.deck.add(card);
        return card;
    }

    outcome(value) {
        this.values.add(value);
        return this;
    }

    delete() {
        if (!this.parent) return this;
        this.gather();
        for (let value of this.values) this.parent.values.add(value);
        this.parent.deck.delete(this);
    }

    gather() {
        for (let child of this.deck) child.delete();
        return this;
    }
}



/* CTRL Main Entry Point
 *
 */



class CTRL {

    constructor() {
        this.sensitiveMap = new SMap(this);
        this.knowledgeBase = new LinkedKnowledge(this, this.sensitiveMap);
        this.intentManager = new IntentManager(this, this.knowledgeBase);
        this.focusManager = new FocusManager(this, this.knowledgeBase);
        this.kanban = new Card(this, false, "root");
    }

    // Sensitive Map

    removeSensor(...args) { return this.sensitiveMap.removeSensor.apply(this.sensitiveMap, args); }

    sensor(...args) { return this.sensitiveMap.sensor.apply(this.sensitiveMap, args); }

    sense(...args) { return this.sensitiveMap.sense.apply(this.sensitiveMap, args); }

    // Knowledge Base

    node(...args) { return this.knowledgeBase.node.apply(this.knowledgeBase, args); }

    get(...args) { return this.knowledgeBase.get.apply(this.knowledgeBase, args); }

    // Intent Manager
    
    action(...args) { return this.intentManager.action.apply(this.intentManager, args); }

    intend(...args) { return this.intentManager.intend.apply(this.intentManager, args); }

    run(...args) { return this.intentManager.run.apply(this.intentManager, args); }

    // Focus Manager

    focus(...args) { return this.FocusManager.focus.apply(this.focusManager, args); }

    blur(...args) { return this.FocusManager.blur.apply(this.focusManager, args); }

    gather(...args) { return this.FocusManager.gather.apply(this.focusManager, args); }
}



module.exports = CTRL;


