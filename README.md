# node-red-sqs

Node-RED interfacing with AWS SQS

**This is a plugin to Node-RED that requires customization of the runtime**

With this plugin each message passes through Amazon Simple Queue Service (SQS) brefore processing. 

## SQS worker 

This is the process that handles messages through an AWS SQS queue and S3 bucket to allow Node-RED load balancing and replay

```javascript

const worker = new Worker({ url: "FIFO SQS URL", bucket: "S3 BUCKET" });

worker.start((msg) => {
    console.log(msg);
});

worker.test({ payload: "Hello World!", _msgid: (1 + Math.random() * 4294967295).toString(16) });

```

## ENV

AWS_ACCESS_KEY_ID": ""\
AWS_SECRET_ACCESS_KEY": ""\
AWS_FLOW_SQS": "AWS SQS FIFO QUEUE"\
AWS_FLOW_S3": "AWS S3 BUCKET"\

