/*
 * *
 *  Copyright 2014 Comcast Cable Communications Management, LLC
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 * /
 */

(function () {
    'use strict';
    /**
     * upload testing based on httpRequests.
     * @param urls - array of url to server endpoint for upload testing.
     * @param type - post request.
     * @param concurrentRuns - number of concurrentRuns.
     * @param timeout - timeout of the request.
     * @param testLength - length of the upload test.
     * @param movingAverage - when to calculate moving average.
     * @param callbackComplete - function callback function for test suite complete event.
     * @param callbackProgress - function callback function for test suite progress event.
     * @param callbackAbort - function callback function for test suite abort event.
     * @param callbackTimeout - function callback function for test suite timeout event.
     * @param callbackError - function callback function for test suite error event.
     * @param size - initial size to start upload testing.
     * @param maxuploadSize - upload size should not exceed max upload size.
     * @param monitorInterval - monitor interval.
     */
    function uploadHttpConcurrentProgress(urls, type, concurrentRuns, timeout, testLength, movingAverage, callbackComplete, callbackProgress, callbackError, size, maxuploadSize,
                                          monitorInterval) {
        this.urls = urls;
        this.size = size;
        this.type = type;
        this.concurrentRuns = concurrentRuns;
        this.timeout = timeout;
        this.testLength = testLength;
        this.movingAverage = movingAverage;
        this.maxuploadSize = maxuploadSize;
        this.monitorInterval = monitorInterval;
        //unique id or test
        this._testIndex = 0;
        //array holding active tests
        this._activeTests = [];
        this.clientCallbackComplete = callbackComplete;
        this.clientCallbackProgress = callbackProgress;
        this.clientCallbackError = callbackError;
        //start time of test suite
        this._beginTime = Date.now();
        //boolean on whether test  suite is running or not
        this._running = true;
        //array holding  results
        this.finalResults = [];
        //monitor interval
        this.interval = null;
        //total probe bytes
        this.totalBytes = 0;
        //results object array
        this.results = [];
        //results count
        this.resultsCount = 0;
        //initializing the random data used for testing upload
        this._payload = null;
        this.uploadResults = [];

    }

    /**
     * onError method
     * @return error object
     */
    uploadHttpConcurrentProgress.prototype.onTestError = function (result) {
        if (this._running) {
            this.clientCallbackError(result);
            clearInterval(this.interval);
            this._running = false;
        }
    };
    /**
     * onAbort method
     * @return abort object
     */
    uploadHttpConcurrentProgress.prototype.onTestAbort = function (result) {
        this._storeResults(result);
        this.totalBytes = this.totalBytes + result.loaded;
    };
    /**
     * onTimeout method
     * @return timeout object
     */
    uploadHttpConcurrentProgress.prototype.onTestTimeout = function () {
        if (this._running) {
            if ((Date.now() - this._beginTime) > this.testLength) {
                clearInterval(this.interval);
                if (this.uploadResults && this.uploadResults.length) {
                    this.clientCallbackComplete(this.uploadResults);
                } else {
                    this.clientCallbackError('no measurements obtained');
                }
                this._running = false;
            }

        }
    };

    /**
     * onComplete method
     */
    uploadHttpConcurrentProgress.prototype.onTestComplete = function (result) {
        if (!this._running) {
            return;
        }

        //store results
        this._storeResults(result);
        var uploadSize = (this.testLength - result.time) * result.loaded / result.time;

        if (uploadSize > this.size) {
            this.size = uploadSize;
            if (this.size > this.maxuploadSize) {
                this.size = this.maxuploadSize;
            }
        }

        if (this.newRun) {
            this.concurrentRuns = 1;
            this.start();
        }
        else {
            this.concurrentRuns = 4;
            this.start();
            //from the third group run. when a connection ends start a new one.
            this.newRun = true;
        }

    };


    /**
     * onProgress method
     */
    uploadHttpConcurrentProgress.prototype.onTestProgress = function (result) {
        if (!this._running) {
            return;
        }
        this.totalBytes = this.totalBytes + result.loaded;
        this._storeResults(result);
    };

    /**
     * Start the test
     */
    uploadHttpConcurrentProgress.prototype.start = function () {
        var request;
        if (!this._running) {
            return;
        }

        if (this._payload === null) {
            this._payload = getRandomData(this.size);
        } else {
            if (this._payload.size !== this.size) {
                this._payload = getRandomData(this.size);
            }
        }

        for (var p = 1; p <= this.concurrentRuns; p++) {
            this._testIndex++;
            this['arrayResults' + this._testIndex] = [];
            request = new window.xmlHttpRequest('POST', this.urls[0], this.timeout, this.onTestComplete.bind(this), this.onTestProgress.bind(this),
                this.onTestAbort.bind(this), this.onTestTimeout.bind(this), this.onTestError.bind(this));
            this._activeTests.push({
                xhr: request,
                testRun: this._testIndex
            });

            request.start(this.size, this._testIndex, this._payload);
        }


    };

    /**
     * Cancel the test
     */
    uploadHttpConcurrentProgress.prototype.abortAll = function () {

        for (var i = 0; i < this._activeTests.length; i++) {
            if (typeof(this._activeTests[i]) !== 'undefined') {
                this._activeTests[i].xhr._request.abort();
            }
        }
    };

    /**
     * store speedtest measurements
     * @param result
     * @private
     */
    uploadHttpConcurrentProgress.prototype._storeResults = function (result) {
        this.results.push(result);
    };

    uploadHttpConcurrentProgress.prototype._calculateResults = function () {
        var intervalBandwidth = 0;
        var totalLoaded = 0;
        var totalTime = 0;
        var intervalCounter = 0;
        this.resultsCount++;

        if (this.results.length > 0) {
            for (var i = 0; i < this.results.length; i++) {
                if (this.results[i].timeStamp > (Date.now() - this.monitorInterval)) {
                    intervalBandwidth = intervalBandwidth + parseFloat(this.results[i].bandwidth);
                    totalLoaded = totalLoaded + this.results[i].chunckLoaded;
                    totalTime = totalTime + this.results[i].totalTime;
                    intervalCounter++;
                }
            }

            if (!isNaN(intervalBandwidth / intervalCounter)) {

                var transferSizeMbs = (totalLoaded * 8) / 1000000;
                var transferDurationSeconds = this.monitorInterval / 1000;
                this.finalResults.push(transferSizeMbs / transferDurationSeconds);
                var lastElem = Math.min(this.finalResults.length, this.movingAverage);
                if (lastElem > 0) {
                    var singleMovingAverage = 0;
                    for (var j = 1; j <= lastElem; j++) {
                        if (isFinite(this.finalResults[this.finalResults.length - j])) {
                            singleMovingAverage = singleMovingAverage + this.finalResults[this.finalResults.length - j];

                        }
                    }
                    singleMovingAverage = singleMovingAverage / lastElem;
                    if (singleMovingAverage > 0) {
                        this.uploadResults.push(singleMovingAverage);
                        this.clientCallbackProgress(singleMovingAverage);
                    }

                }

            }

        }
    };


    /**
     * Monitor testSeries
     */
    uploadHttpConcurrentProgress.prototype._monitor = function () {
        this._calculateResults();
        //check for end of test
        if ((Date.now() - this._beginTime) > (this.testLength)) {
            this.abortAll();
            this._running = false;
            clearInterval(this.interval);
            if (this.uploadResults && this.uploadResults.length) {
                var uploadResults = this.uploadResults;
                var dataLength = uploadResults.length;
                var data = slicing(uploadResults, Math.round(dataLength * 0.4), dataLength);
                data = data.sort(numericComparator);
                var result = meanCalculator(data);
                this.clientCallbackComplete(result);
            } else {
                this.clientCallbackError('no measurements obtained');
            }

        }

    };

    /**
     * reset test variables
     */
    uploadHttpConcurrentProgress.prototype.initiateTest = function () {
        this._testIndex = 0;
        this.finalResults.length = 0;
        this.uploadResults.length = 0;
        this._running = true;
        this.interval = null;
        this.totalBytes = 0;
        this._payload = null;
        this.interval = setInterval(function () {
            self._monitor();
        }, 100);
        this.start();
        var self = this;

    };

    /**
     * getRandomData creates a random data used for testing the upload bandwidth.
     * @param size - creates a blob of the given size.
     * @returns {*}
     */
    function getRandomData(size) {

        function getData() {
            return Math.random().toString();
        }

        var count = size / 2;
        var result = getData();

        while (result.length <= count) {
            result += getData();
        }

        result = result + result.substring(0, size - result.length);
        var blob;
        try {
            blob = new Blob([result], {type: "application/octet-stream"});
        } catch (e) {
            var bb = new BlobBuilder; // jshint ignore:line
            bb.append(result);
            blob = bb.getBlob("application/octet-stream");
        }
        return blob;
    }

    //TODO will be moved to a seperate file
    function slicing(data, start, end) {
        return data.slice(start, end);
    }

    function meanCalculator(arr) {
        var peakValue = arr[arr.length - 1];
        var sum = arr.reduce(function (a, b) {
            return a + b;
        }, 0);
        var mean = sum / arr.length;
        return {
            mean: mean,
            peakValue: peakValue
        };
    }

    function numericComparator(a, b) {
        return (a - b);
    }

    window.uploadHttpConcurrentProgress = uploadHttpConcurrentProgress;
})();
