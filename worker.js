"use strict";

var AWS = require('aws-sdk');

class Worker {

    constructor(options) {

        this.options = options;
        this.url = options.url;
        this.bucket = options.bucket;
        this.log = this.options.log || console;

        var clientParams = this.options.sqs || {};
        if (!clientParams.apiVersion) clientParams.apiVersion = '2012-11-05';
        if (!clientParams.region) clientParams.region = this.options.url.match(/(us(-gov)?|ap|ca|cn|eu|sa)-(central|(north|south)?(east|west)?)-\d/g)[0];
        this.client = new AWS.SQS(clientParams);
        this.region = clientParams.region;

        this.storage = new AWS.S3();

    }

    start(callback) {
        if (typeof callback !== 'function') return;
        if (this.callback) return;
        this.callback = callback;
        this.receiving = 0;
        this.checkMessages();
    }

    stop() {
        delete this.callback;
        this.receiving = 0;
    }

    checkMessages() {

        if (this.receiving) return;
        if (!this.callback) return;

        var that = this;

        this.receiving++;

        var queue = this.options.url;
        var timeout = this.options.timeout || void 0;
        var attributes = Array.isArray(this.options.attributes) ? this.options.attributes.slice() : [];

        var params = {
            QueueUrl: queue,
            MaxNumberOfMessages: 10,
            VisibilityTimeout: timeout,
            WaitTimeSeconds: 10,
            AttributeNames: attributes
        };

        this.client.receiveMessage(params, function (err, data) {

            that.receiving--;

            if (err) {
                that.log.error({ err: err, params: params }, 'failed to receive messages')
                return;
            }

            if (Array.isArray(data.Messages)) {
                data.Messages.map(that.handleMessage, that)
            }

            that.checkMessages();

        });

    }

    handleMessage(msg) {

        if (!this.callback) return;

        var that = this;

        var msgParts = msg.Body.match(/(.+)\/(.+)\/(.+)\/([\d\-T:.]+Z)\.(.+)\.json/);
        var flowId = msgParts[1];
        var fromId = msgParts[2];
        var toId = msgParts[3];
        //var sendDate = msgParts[4];

        var s3Params = {
            Bucket: this.bucket,
            Key: msg.Body
        };

        this.storage.getObject(s3Params, function (err, data) {
            if (err) {
                that.log.error(err);
            } else {

                var msgBody = JSON.parse(data.Body.toString());
                msgBody._msginfo = { flow: flowId, from: fromId, to: toId };
                //msgBody._msginfo.sent = sendDate;

                var sqsParams = {
                    QueueUrl: that.options.url,
                    ReceiptHandle: msg.ReceiptHandle
                };
    
                that.client.deleteMessage(sqsParams, function (err) {
                    
                    if (err) {
                        that.log.error(err);
                    } else {

                        // var now = new Date();
                        // msgBody._msginfo.received = now.toISOString();
                        // msgBody._msginfo.delay = now - (new Date(msgBody._msginfo.sent));

                        try {
                            that.callback(msgBody);
                        }
                        catch (ex) {
                        }    
                    }
                    
                    that.checkMessages();

                });

            }
        });

    }

    sendMessage(from, to, msg) {

        var that = this;

        return new Promise(function (resolve, reject) {

            if (!from || !to || !msg || !msg._msgid) reject();
            else {

                var dateNow = (new Date()).toISOString();
                var filePath = `${from._flow.id}/${from.id}/${to.id}/${dateNow}.${msg._msgid}.json`;

                var s3Params = {
                    Bucket: that.bucket,
                    ContentType: 'application/json; charset=utf-8',
                    Key: filePath,
                    Body: JSON.stringify(msg)
                };

                that.storage.upload(s3Params, function (err, data) {

                    if (err) reject(err);
                    else {

                        var sqsParams = {
                            QueueUrl: that.url,
                            MessageBody: filePath,
                            MessageDeduplicationId: (1 + Math.random() * 4294967295).toString(16),
                            MessageGroupId: from._flow.id
                        };

                        that.client.sendMessage(sqsParams, function (err, data) {
                            if (err) reject(err);
                            else resolve();
                        });

                    }

                });

            }

        });

    }

}

module.exports = Worker;
