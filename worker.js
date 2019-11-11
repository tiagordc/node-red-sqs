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
        this.parallel = this.options.parallel || 1;
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
            MaxNumberOfMessages: Math.min(this.parallel, 10),
            VisibilityTimeout: timeout,
            WaitTimeSeconds: 20,
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

        var msgParts = msg.Body.match(/(.+)\/(.+)\/(.+?)\.(.+)\.json/);
        var fromId = msgParts[1];
        var toId = msgParts[2];
        var unixDate = msgParts[3];

        var s3Params = {
            Bucket: this.bucket,
            Key: msg.Body
        };

        this.storage.getObject(s3Params, function (err, data) {
            if (err) {
                that.log.error(err);
            } else {

                var msgBody = JSON.parse(data.Body.toString());
                msgBody._msginfo = { from: fromId, to: toId, date: unixDate };

                var sqsParams = {
                    QueueUrl: that.options.url,
                    ReceiptHandle: msg.ReceiptHandle
                };
    
                that.client.deleteMessage(sqsParams, function (err) {
                    
                    if (err) {
                        that.log.error(err);
                    } else {
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

                var unixNow = + new Date();
                var filePath = `${from.id}/${to.id}/${unixNow}.${msg._msgid}.json`;

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
                            MessageDeduplicationId: msg._msgid,
                            MessageGroupId: msg._msgid
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
