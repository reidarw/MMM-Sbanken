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
        // clientId and password must be set in the config
        urlIdentityServer: 'https://auth.sbanken.no/identityserver/connect/token',
        urlApiBase: 'https://publicapi.sbanken.no/apibeta/api/v1/',
        header: 'Bankinfo',
        displayOnlyAccounts: [],
        aliasForAccountLabels: [],
        sumAccountsLabel: 'Sum',
        sumAccounts: [],
        salaryAccounts: [],
        salaryNotificationMinimumAmount: 10000,
        minWidth: 250,
        numberOfDecimals: 2,
        showFutureAccountBalance: true,
        showTransactionsToday: true,
        showOnlyExpensesInTransactions: true,
        todayTransactionsHeader: 'Dagens utgifter:',
        noTransactionsLabel: 'Ingen utgifter i dag',
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
        this.salaryReceived = false;
        this.salaryReceivedOnAccounts = [];
        this.getToken();
        this.scheduleUpdate();
        moment.locale();
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

    setSalaryReceived: function(account) {
        this.salaryReceived = true;
        let labelAlias = this.config.aliasForAccountLabels;
        label = labelAlias[account] ? labelAlias[account] : account;
        this.salaryReceivedOnAccounts.push(label);
    },

    displaySalary: function(content) {
        content.appendChild(this.getInfoLine('&#10003; ' + this.translate("salaryReceived") +
            ' (' + this.salaryReceivedOnAccounts.join(', ') + ')'));
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

    getAccountLine: function(label, sum) {
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
    },

    getInfoLine: function(text) {
        let infoContainer = document.createElement("div");
        infoContainer.className = 'dimmed light small';
        infoContainer.innerHTML = text;
        return infoContainer;
    },

    displayHeader: function(content) {
        let headerContainer = document.createElement('div');
        headerContainer.innerHTML = this.config.header;
        headerContainer.className = 'dimmed light';
        content.appendChild(headerContainer);
    },

    displayAndSumAccounts: function(content) {
        let aryShowAccounts = this.config.displayOnlyAccounts;
        let blnDisplayAllAccounts = !aryShowAccounts;
        let aryAccountsToDiff = this.config.sumAccounts;
        let blnUseAccountBuffer = aryAccountsToDiff;
        let labelAlias = this.config.aliasForAccountLabels;
        let numberOfDecimals = this.config.numberOfDecimals;
        let diffSum = 0;
        let self = this;
        let accountNumber;

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
                content.appendChild(self.getAccountLine(label, account.balance.toFixed(numberOfDecimals)));
            }
        });
        return diffSum;
    },

    displayFutureAccountBalance: function(content) {
        // Refill to account will be done after payDay + payDayBufferDays
        let payDayThisMonth = new Date();
        payDayThisMonth.setDate((this.config.payDay + this.config.payDayBufferDays));
        payDayThisMonth = moment(payDayThisMonth);

        content.appendChild(document.createElement("hr"));
        let paymentInfo = this.payments;
        const needsRefillText = this.translate("needsRefill");

        let blnAllAccountsInBalance = true;
        let self = this;
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
                    content.appendChild(self.getAccountLine(needsRefillText, account.name));
                }
            }
        });

        if (blnAllAccountsInBalance) {
            content.appendChild(this.getInfoLine('&#10003; ' + this.translate("allAccountsAreInBalance")));
        }
    },

    displaySalaryAndTransactions: function(content) {
        let transactions = this.transactions;
        let noExpenses = true;
        let showOnlyExpensesInTransactions = this.config.showOnlyExpensesInTransactions;
        let accountNumber, label;
        let transactionLines = [];
        let self = this;
        let today = moment().startOf('day');
        let arySalaryAccounts = this.config.salaryAccounts;
        let blnSalaryCheck = arySalaryAccounts;
        this.salaryReceivedOnAccounts = [];

        this.bankAccounts.items.forEach (function(account) {
            accountNumber = parseInt(account.accountNumber);
            if (transactions[accountNumber] && transactions[accountNumber].items) {
                transactions[accountNumber].items.forEach (function(transaction) {
                    // accountingDate vs interestDate
                    if (moment(transaction.interestDate).isSame(moment(today)) && transaction.source !== 'Archive') {
                        let label = transaction.text.toLowerCase();
                        label = label.replace(/ nok | kurs|\d|\*|:|\./g, '').trim();
                        label = label.charAt(0).toUpperCase() + label.slice(1);
                        if (transaction.transactionType === 'Avtalegiro') {
                            label += ' (' + account.name + ')';
                        }
                        if (showOnlyExpensesInTransactions) {
                            if(transaction.amount < 0) {
                                noExpenses = false;
                                transactionLines.push(self.getAccountLine(label, transaction.amount));
                            }
                        } else {
                            noExpenses = false;
                            transactionLines.push(self.getAccountLine(label, transaction.amount));
                        }

                        if (blnSalaryCheck &&
                            arySalaryAccounts.includes(accountNumber) &&
                            transaction.amount > self.config.salaryNotificationMinimumAmount) {
                            self.setSalaryReceived(accountNumber);
                        }

                    }
                });
            }
        });

        if (this.salaryReceived) {
            this.displaySalary(content);
        }

        if (this.config.showTransactionsToday) {
            if (noExpenses) {
                content.appendChild(this.getInfoLine('&#10003; ' + this.config.noTransactionsLabel));
            } else {
                content.appendChild(document.createElement("hr"));
                if (this.config.todayTransactionsHeader) {
                    content.appendChild(this.getInfoLine(this.config.todayTransactionsHeader));
                }
                transactionLines.forEach(function(transaction) {
                    content.appendChild(transaction);
                });
            }
        }
    },

    getDom: function() {
        let contentWrapper = document.createElement("div");
        let self = this;

        if (this.loaded === false) {
            contentWrapper.innerHTML = this.translate("loading") + '...';
            contentWrapper.className = "dimmed light small";
            return contentWrapper;
        }

        if (this.config.header) {
            this.displayHeader(contentWrapper);
        }

        if (this.config.minWidth) {
            contentWrapper.style.minWidth = this.config.minWidth + 'px';
        }

        let numberOfDecimals = this.config.numberOfDecimals;

        if(this.bankAccounts.error) {
            let errorDescription = 'An error occured ('+this.bankAccounts.responseCode+')';
            if (this.bankAccounts.responseCode === 429) {
                errorDescription = 'Too many requests'
            }
            contentWrapper.appendChild(self.getInfoLine(errorDescription + '. Retry in 20 seconds'));
            setTimeout(() => {this.getToken();}, 20000);
            return contentWrapper;
        }
        let diffSum = self.displayAndSumAccounts(contentWrapper);
        if (diffSum) {
            contentWrapper.appendChild(document.createElement("hr"));
            contentWrapper.appendChild(self.getAccountLine(this.config.sumAccountsLabel,
                diffSum.toFixed(numberOfDecimals)));
        }

        if (this.config.showFutureAccountBalance) {
            this.displayFutureAccountBalance(contentWrapper);
        }

        this.displaySalaryAndTransactions(contentWrapper);

        return contentWrapper;
    }
});
