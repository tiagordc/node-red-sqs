# node-red-sqs

Node-RED interfacing with AWS SQS

**This is a plugin to Node-RED that requires customization of the runtime, see changes below**

With this plugin each message passes through Amazon Simple Queue Service (SQS) and S3 allowing Node-RED load balancing and flow replay. 

## Node-RED changes

packages > node_modules > @node-red > runtime > lib > index.js

```javascript

var sqs = require("node-red-sqs");

...

function start() {
    return ...
    .then(function() {
        return sqs.init(function(msg) {
            var node = redNodes.getNode(msg._msginfo.to);
            if (node) node.receive(msg);
        });
    });

}

```

packages > node_modules > @node-red > runtime > lib > nodes > Node.js

```javascript

var sqs = require("node-red-sqs");

...

Node.prototype.send = function(msg) {   
    sqs.send.call(this, msg);
}

```

## Required ENV variables

AWS_ACCESS_KEY_ID": "ACCESS ID"\
AWS_SECRET_ACCESS_KEY": "ACCESS KEY"\
AWS_FLOW_SQS": "SQS FIFO QUEUE URL"\
AWS_FLOW_S3": "AWS S3 BUCKET NAME"

