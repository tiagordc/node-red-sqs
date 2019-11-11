"use strict";

var util = require("util");
var Worker = require("./worker");

function generateId() {
    return (1 + Math.random() * 4294967295).toString(16);
}

function cloneMessage(msg) {

    var req = msg.req;
    var res = msg.res;

    delete msg.req;
    delete msg.res;

    var m = clone(msg);

    if (req) {
        m.req = req;
        msg.req = req;
    }

    if (res) {
        m.res = res;
        msg.res = res;
    }

    return m;

}

module.exports = {

    init: function(cb) {
        return new Promise(function (resolve, reject) {
            var worker = new Worker({ url: process.env.AWS_FLOW_SQS, bucket: process.env.AWS_FLOW_S3 });
            worker.start(cb);
            resolve();
        });
    },
    
    send: function (msg) {

        var worker = new Worker({ url: process.env.AWS_FLOW_SQS, bucket: process.env.AWS_FLOW_S3 });

        var msgSent = false;
        var node;

        if (msg === null || typeof msg === "undefined") {
            return;
        } 

        if (!util.isArray(msg)) {

            if (this._wire) {

                if (!msg._msgid) {
                    msg._msgid = generateId();
                }

                this.metric("send", msg);
                node = this._flow.getNode(this._wire);

                if (node) {
                    //node.receive(msg);
                    worker.sendMessage(this, node, msg);
                }

                return;

            } else {
                msg = [msg];
            }

        }

        var numOutputs = this.wires.length;
        var sendEvents = []; // Build a list of send events so that all cloning is done before any calls to node.receive
        var sentMessageId = null;

        for (var i = 0; i < numOutputs; i++) { // for each output node

            var wires = this.wires[i];
            
            if (i < msg.length) {

                var msgs = msg[i]; 

                if (msgs !== null && typeof msgs !== "undefined") {

                    if (!util.isArray(msgs)) {
                        msgs = [msgs];
                    }

                    var k = 0;
                    
                    for (var j = 0; j < wires.length; j++) { // for each recipent node of that output

                        node = this._flow.getNode(wires[j]);

                        if (node) {
                            
                            for (k = 0; k < msgs.length; k++) { // for each msg to send eg. [[m1, m2, ...], ...]

                                var m = msgs[k];

                                if (m !== null && m !== undefined) {

                                    if (!sentMessageId) {
                                        sentMessageId = m._msgid;
                                    }

                                    if (msgSent) {
                                        var clonedmsg = cloneMessage(m);
                                        sendEvents.push({ n: node, m: clonedmsg });
                                    } else {
                                        sendEvents.push({ n: node, m: m });
                                        msgSent = true;
                                    }

                                }
                            }
                        }
                    }
                }
            }
        }

        if (!sentMessageId) sentMessageId = generateId();
        this.metric("send", { _msgid: sentMessageId });

        for (i = 0; i < sendEvents.length; i++) {

            var ev = sendEvents[i];

            if (!ev.m._msgid) {
                ev.m._msgid = sentMessageId;
            }

            worker.sendMessage(this, ev.n, ev.m);
            //ev.n.receive(ev.m);

        }

    }

};