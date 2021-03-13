const request = require('request');
const node_helper = require("node_helper");

module.exports = node_helper.create({
    socketNotificationReceived: function (notification, payload) {
        const self = this;
        let getError = function(responseCode) {
            return {error: true, responseCode: responseCode}
        };
        if (notification === "GET_TOKEN") {
            const url = payload.config.urlIdentityServer;
            let returnData;
            let data = {gg
                'client_id': payload.config.clientId,
                'client_secret': payload.config.clientSecret,
                'grant_type': 'client_credentials'
            };
            request({
                method: 'POST',
                uri: url,
                form: data
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    returnData = JSON.parse(body);
                } else {
                    returnData = getError(response.statusCode);
                }
                self.sendSocketNotification("TOKEN", returnData);
            });
        }
        if (notification === "GET_BANK_ACCOUNTS") {
            const url = payload.config.urlApiBase + 'Accounts/';
            let returnData;
            let headers = {
                'Authorization': 'Bearer ' + payload.token.access_token,
                'customerId': payload.config.customerId,
            };
            request({
                method: 'GET',
                uri: url,
                headers: headers
            }, function (error, response, body) {
                if (!error && response.statusCode === 200) {
                    returnData = JSON.parse(body);
                } else {
                    returnData = getError(response.statusCode);
                }
                self.sendSocketNotification("BANK_ACCOUNTS", returnData);
            });
        }
        if (notification === "GET_PAYMENTS") {
            let payments = {};
            let i = 0;
            let accountCount = 0;
            if (typeof payload.bankAccounts.items !== 'undefined') {
                accountCount = payload.bankAccounts.items.length;
            }

            if (payload.config.showFutureAccountBalance && payload.bankAccounts && payload.bankAccounts.items) {
                payload.bankAccounts.items.forEach (function(account) {
                    let getPayments = new Promise(function(resolve, reject) {
                        let accountId = account.accountId;
                        let url = payload.config.urlApiBase + 'Payments/' + accountId;
                        let headers = {
                            'Authorization': 'Bearer ' + payload.token.access_token,
                            'customerId': payload.config.customerId,
                        };
                        request({
                            method: 'GET',
                            uri: url,
                            headers: headers
                        }, function (error, response, body) {
                            if (!error && response.statusCode === 200) {
                                return resolve(JSON.parse(body));
                            } else {
                                reject(accountId);
                            }
                        });
                    });

                    getPayments.then(
                        function(value) {
                            i++;
                            payments[account.accountNumber] = value;
                            if (i === accountCount) {
                                self.sendSocketNotification("PAYMENTS", payments);
                            }
                        },
                        function(error) {
                            i++;
                            console.log('Error getting payment info for ' + error + ')');
                        }
                    );
                });
            } else {
                self.sendSocketNotification("PAYMENTS", []);
            }
        }
        if (notification === "GET_TRANSACTIONS") {
            let payments = {};
            let i = 0;
            let accountCount = 0;
            if (typeof payload.bankAccounts.items !== 'undefined') {
                accountCount = payload.bankAccounts.items.length;
            }
            if (payload.config.showTransactionsToday && payload.bankAccounts && payload.bankAccounts.items) {
                payload.bankAccounts.items.forEach(function (account) {
                    let getTransactions = new Promise(function (resolve, reject) {
                        let accountId = account.accountId;
                        let url = payload.config.urlApiBase + 'Transactions/' + accountId;
                        let headers = {
                            'Authorization': 'Bearer ' + payload.token.access_token,
                            'customerId': payload.config.customerId,
                        };
                        request({
                            method: 'GET',
                            uri: url,
                            headers: headers
                        }, function (error, response, body) {
                            if (!error && response.statusCode === 200) {
                                return resolve(JSON.parse(body));
                            } else {
                                reject(accountId);
                            }
                        });
                    });

                    getTransactions.then(
                        function (value) {
                            i++;
                            payments[account.accountNumber] = value;
                            if (i === accountCount) {
                                self.sendSocketNotification("TRANSACTIONS", payments);
                            }
                        },
                        function (error) {
                            i++;
                            console.log('Error getting transaction info for ' + error + ')');
                        }
                    );
                });
            } else {
                self.sendSocketNotification("TRANSACTIONS", []);
            }

        }

    },
});
