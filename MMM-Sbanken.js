/*
 * Magic Mirror module for displaying transactions and account balance from Sbanken (Norway's first  online bank)
 * By Reidar W https://github.com/reidarw/MMM-Sbanken
 * MIT Licensed
 *
 * Dependent on API from Sbanken:
 * https://api.sbanken.no/exec.bank/swagger/
 * https://github.com/Sbanken/api-examples
 *
 * In order to get access to these APIs certain requirements needs to be fulfilled:
 *
 *  - You are a Sbanken customer
 *  - You have to sign up for access via https://utvikler.sbanken.no
 *  - You have to enable "Beta" in your personal settings
 *  - Finally, you need to complete the API Beta setup wizard.
 */

Module.register("MMM-Sbanken", {
    defaults: {
        // clientId, customerId (your social security number) and password must be set in the config
        urlIdentityServer: 'https://auth.sbanken.no/identityserver/connect/token',
        urlApiBase: 'https://api.sbanken.no/exec.bank/api/v1/',
        header: 'Bankinfo',
        displayOnlyAccounts: [],
        sumAccountsLabel: 'Sum',
        sumAccounts: [],
        minWidth: 250,
        numberOfDecimals: 2,
        showFutureAccountBalance: true,
        showTransactionsToday: true,
        showOnlyExpensesInTransactions: true,
        todayTransactionsHeader: 'Dagens utgifter:',
        noTransactionsLabel: '&#128077; Ingen utgifter i dag',
        payDay: 15,
        payDayBufferDays: 4,
        updateInterval: 60 * 60 * 1000 // 1 hour
    },

    start: function() {
        this.bankAccounts = [];
        this.payments = [];
        this.transactions = [];
        this.tokenInfo = {};
        this.loaded = false;
        this.getToken();
        this.scheduleUpdate();
    },

    getScripts: function() {
        return ['moment.js'];
    },

    getStyles: function() {
        return ['MMM-Sbanken.css']
    },

    getToken: function() {
        this.sendSocketNotification("GET_TOKEN", {
            config: this.config
        });
    },

    getBankAccounts: function() {
        this.sendSocketNotification("GET_BANK_ACCOUNTS", {
            config: this.config,
            token: this.tokenInfo
        });
    },

    getPayments: function() {
        this.sendSocketNotification("GET_PAYMENTS", {
            config: this.config,
            token: this.tokenInfo,
            bankAccounts: this.bankAccounts
        });
    },

    getTransactions: function() {
        this.sendSocketNotification("GET_TRANSACTIONS", {
            config: this.config,
            token: this.tokenInfo,
            bankAccounts: this.bankAccounts
        });
    },

    scheduleUpdate: function(delay) {
        let nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }
        const self = this;
        setInterval(function() {
            self.getToken();
        }, nextLoad);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "TOKEN") {
            this.tokenInfo = payload;
            this.getBankAccounts();
        }
        if (notification === "BANK_ACCOUNTS") {
            this.bankAccounts = payload;
            this.getPayments();
            this.loaded = true;
        }
        if (notification === "PAYMENTS") {
            this.payments = payload;
            this.getTransactions();
        }
        if (notification === "TRANSACTIONS") {
            this.transactions = payload;
            this.updateDom(1000);
        }
    },

    getTranslations: function() {
        return {
            nb: "translations/nb.json",
            en: "translations/en.json"
        };
    },

    getDom: function() {
        let contentWrapper = document.createElement("div");

        if (this.loaded === false) {
            contentWrapper.innerHTML = this.translate("loading") + '...';
            contentWrapper.className = "dimmed light small";
            return contentWrapper;
        }

        if (this.config.header) {
            let headerContainer = document.createElement('div');
            headerContainer.innerHTML = this.config.header;
            headerContainer.className = 'dimmed light';
            contentWrapper.appendChild(headerContainer);
        }

        let getAccountLine = function(label, sum) {
            let accountContainer = document.createElement("div");
            accountContainer.className = 'sbanken-account-container';
            let labelContainer = document.createElement("div");
            labelContainer.className = 'dimmed light small';
            labelContainer.innerHTML = label;
            let balanceContainer = document.createElement("div");
            balanceContainer.className = 'light small';
            balanceContainer.innerHTML = sum;
            accountContainer.appendChild(labelContainer);
            accountContainer.appendChild(balanceContainer);
            return accountContainer;
        };

        let getInfoLine = function(text) {
            let infoContainer = document.createElement("div");
            infoContainer.className = 'dimmed light small';
            infoContainer.innerHTML = text;
            return infoContainer;
        };

        if (this.config.minWidth) {
            contentWrapper.style.minWidth = this.config.minWidth + 'px';
        }

        let aryShowAccounts = this.config.displayOnlyAccounts;
        let labelAlias = this.config.aliasForAccountLabels;
        let blnDisplayAllAccounts = !aryShowAccounts;
        let aryAccountsToDiff = this.config.sumAccounts;
        let blnUseAccountBuffer = aryAccountsToDiff;
        let diffSum = 0;
        let numberOfDecimals = this.config.numberOfDecimals;
        let accountNumber, label;

        if(this.bankAccounts.error) {
            let errorDescription = 'An error occured ('+this.bankAccounts.responseCode+')';
            if (this.bankAccounts.responseCode === 429) {
                errorDescription = 'Too many requests'
            }
            contentWrapper.appendChild(getInfoLine(errorDescription + '. Retry in 20 seconds'));
            setTimeout(() => {this.getToken();}, 20000);
            return contentWrapper;
        }
        this.bankAccounts.items.forEach (function(account) {
            accountNumber = parseInt(account.accountNumber);
            if (blnUseAccountBuffer && aryAccountsToDiff.includes(accountNumber)) {
                if (!diffSum) {
                    diffSum = account.balance;
                } else {
                    diffSum += account.balance;
                }
            }

            if (blnDisplayAllAccounts || aryShowAccounts.includes(accountNumber)) {
                label = labelAlias[accountNumber] ? labelAlias[accountNumber] : account.name;
                contentWrapper.appendChild(getAccountLine(label, account.balance.toFixed(numberOfDecimals)));
            }
        });

        if (diffSum) {
            contentWrapper.appendChild(document.createElement("hr"));
            contentWrapper.appendChild(getAccountLine(this.config.sumAccountsLabel, diffSum.toFixed(numberOfDecimals)));
        }

        moment.locale();

        if (this.config.showFutureAccountBalance) {
            // Refill to account will be done after payDay + payDayBufferDays
            let payDayThisMonth = new Date();
            payDayThisMonth.setDate((this.config.payDay + this.config.payDayBufferDays));
            payDayThisMonth = moment(payDayThisMonth);

            contentWrapper.appendChild(document.createElement("hr"));
            let paymentInfo = this.payments;
            const needsRefillText = this.translate("needsRefill");

            let blnAllAccountsInBalance = true;
            this.bankAccounts.items.forEach (function(account) {
                if (account.accountType !== 'Creditcard account') {
                    accountNumber = parseInt(account.accountNumber);
                    paymentInfo[accountNumber].items.forEach (function(payment) {
                        if(payDayThisMonth > moment(payment.dueDate)) {
                            account.balance -= payment.amount;
                        }

                    });
                    if (account.balance <= 0) {
                        blnAllAccountsInBalance = false;
                        contentWrapper.appendChild(getAccountLine(needsRefillText, account.name));
                    }
                }
            });

            if (blnAllAccountsInBalance) {
                contentWrapper.appendChild(getInfoLine('&#10003; ' + this.translate("allAccountsAreInBalance")));
            }
        }

        if (this.config.showTransactionsToday) {
            contentWrapper.appendChild(document.createElement("hr"));
            if (this.config.todayTransactionsHeader) {
                contentWrapper.appendChild(getInfoLine(this.config.todayTransactionsHeader));
            }
            let transactions = this.transactions;
            let noExpenses = true;
            let showOnlyExpensesInTransactions = this.config.showOnlyExpensesInTransactions;
            this.bankAccounts.items.forEach (function(account) {
                accountNumber = parseInt(account.accountNumber);
                let today = moment().startOf('day');
                if (transactions[accountNumber] && transactions[accountNumber].items) {
                    transactions[accountNumber].items.forEach (function(transaction) {
                        // accountingDate vs interestDate
                        if (moment(transaction.interestDate).isSame(moment(today))) {
                            let label = transaction.text.toLowerCase();
                            label = label.replace(/ nok | kurs|\d|\*|:|\./g, '').trim();
                            label = label.charAt(0).toUpperCase() + label.slice(1);
                            if (transaction.transactionType === 'Avtalegiro') {
                                label += ' (' + account.name + ')';
                            }
                            if (showOnlyExpensesInTransactions) {
                                if(transaction.amount < 0) {
                                    noExpenses = false;
                                    contentWrapper.appendChild(getAccountLine(label, transaction.amount));
                                }
                            } else {
                                noExpenses = false;
                                contentWrapper.appendChild(getAccountLine(label, transaction.amount));
                            }
                        }
                    });
                }

            });
            if (noExpenses) {
                contentWrapper.appendChild(getInfoLine(this.config.noTransactionsLabel));
            }
        }

        return contentWrapper;
    }
});
