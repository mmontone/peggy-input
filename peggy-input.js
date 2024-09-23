//const _ = require('lodash');
// Use minified module versions to reduce build size
const _ = require('./node_modules/lodash/lodash.min.js');
const peggy = require('peggy');
const loglevel = require('loglevel');

/* Utilities */

// Extension for getting cursor position in input field
function getCursorPosition (input) {
    if ('selectionStart' in input) {
        // Standard-compliant browsers
        return input.selectionStart;
    } else if (document.selection) {
        // IE
        input.focus();
        var sel = document.selection.createRange();
        var selLen = document.selection.createRange().text.length;
        sel.moveStart('character', -input.value.length);
        return sel.text.length - selLen;
    }
}

function setCursorPosition (input, pos) {
    input.selectionStart = pos;
    input.selectionEnd = pos;
}

function insertAfter (referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

// TODO: implement copying from Peggy generate-js.js file
function classEscape (s) {
    return s;
}

function describeExpectation(exp) {
    switch(exp.type) {
        case 'literal':
            return exp.text;; // TODO: escape text
        case 'class':
            var escapedParts = exp.parts.map(function(part) {
                return Array.isArray(part)
                    ? classEscape(part[0]) + "-" + classEscape(part[1])
                    : classEscape(part);
            });

            return "[" + (exp.inverted ? "^" : "") + escapedParts.join("") + "]";
        case 'any':
            return "any character";
        case 'end':
            return "end of input"
        case 'other':
            return exp.description
    }
}

function describeExpected(expected) {
    var descriptions = expected.map(describeExpectation);
    var i, j;

    descriptions.sort();

    if (descriptions.length > 0) {
        for (i = 1, j = 1; i < descriptions.length; i++) {
            if (descriptions[i - 1] !== descriptions[i]) {
                descriptions[j] = descriptions[i];
                j++;
            }
        }
        descriptions.length = j;
    }

    switch (descriptions.length) {
        case 1:
            return descriptions[0];

        case 2:
            return descriptions[0] + " or " + descriptions[1];

        default:
            return descriptions.slice(0, -1).join(", ")
                + ", or "
                + descriptions[descriptions.length - 1];
    }
}

/* Insert string at position */
function insertString(str, insertStr, position) {
    return str.substring(0, position) + insertStr + str.substring(position);
}

/* PeggyInput object */
function PeggyInput(input, opts) {
    this.logger = loglevel.getLogger('peggy-input');
    this.partialInput = null;
    this.value = null;
    this.error = null;
    this.candidatesIndex = {};
    this.init(input, opts).then(this.updateStatus.bind(this));
    return this;
}

/* API */
PeggyInput.prototype.isValid = function () {
    return this.error == null;
};

PeggyInput.prototype.getValue = function () {
    return this.value;
};

PeggyInput.prototype.getError = function () {
    return this.error;
};

PeggyInput.prototype.getInput = function () {
    return this.input.get(0);
};

PeggyInput.prototype.formatErrorMsg = function () {
    if (this.errorMsgFormatter) {
        if (this.errorMsgFormatter === 'describeExpected') {
            let expected = this.getError().expected;
            return 'Enter: ' + describeExpected(expected);
        } else {
            return this.errorMsgFormatter(this, this.getError());
        }
    } else {
        return this.getError().message;
    }
};

/* Update the status of the PeggyInput based on the current input value */
PeggyInput.prototype.updateStatus = function () {

    /* If the input is empty and should not be validated */
    if (!this.input.value && !this.validateWhenBlank) {
        this.value = null;
        this.error = null;
        this.syntaxErrorMsg.innerHTML = '';
        this.completionsArea.style.display = "none";
        return;
    }


    /* To determine the status, try to parse current input */
    try {
        this.syntaxErrorMsg.innerHTML = '';
        this.value = this.parser.parse(this.input.value, {
            peggyInput: this
        });
        this.error = null;
        this.input.classList.remove('error');
        if (this.getInput().willValidate) {
            this.getInput().setCustomValidity('');
        }
    }
    catch (syntaxError) {
        this.logger.debug({syntaxError});
        this.value = null;
        this.error = syntaxError;
        let errorMsg = this.formatErrorMsg();
        this.syntaxErrorMsg.innerHTML = errorMsg;
        this.input.classList.add('error');
        if (this.getInput().willValidate) {
            this.getInput().setCustomValidity(errorMsg);
        }
    }

    if (this.changeHandler) {
        this.changeHandler(this);
    }
};

/* Destroy the PeggyInput instance */
PeggyInput.prototype.destroy = function () {
    this.syntaxErrorMsg.remove();
    this.completionsArea.remove();
    this.syntaxErrorMsg = null;
    this.completionsArea = null;
};

/* The main function for providing the completions to the user */
PeggyInput.prototype.complete = function (input) {

    try {
        this.syntaxErrorMsg.html('');
        this.value = this.parser.parse(input, {
            peggyInput: this
        });
        this.error = null;
    }
    catch(syntaxError) {
        this.logger.debug({syntaxError});
        this.value = null;
        this.error = syntaxError;
        var completions = [];
        let expected = _.uniqWith(syntaxError.expected, _.isEqual);

        if (this.input.value || this.validateWhenBlank) {
            this.syntaxErrorMsg.html(this.formatErrorMsg());
        }

        expected.forEach(function (expectation) {
            switch (expectation.type) {
                case 'literal':
                    completions.push(expectation.text);
                    break;
                case 'other':
                    completions.push(expectation.description);
                    break;
            }
        });

        this.logger.debug('Completions', completions);

        /* When the input matches a completer rule, expand the completion candidates */
        var expandedCompletions = [];
        completions.forEach(function (completion) {
            let completer = this.completers[completion];
            if (completer) { /* There's a completer for the completion. Expand candidates */
                let completionsCharCount = _.defaultTo(completer.charCount, this.completionsCharCount);

                /* Only expand if completions characters count is enough */
                if (!(completionsCharCount > 0) || (this.partialInput && this.partialInput.length >= completionsCharCount)) {
                    expandedCompletions = expandedCompletions.concat(this.getCandidatesLabels(completer.candidates));
                }
            } else {
                expandedCompletions = expandedCompletions.concat([completion]);
            }
        }.bind(this));

        completions = expandedCompletions;

        this.logger.debug('Expanded Completions', completions);

        // Filter the possible options based on what was found unparsed
        // in the syntax error:
        if (syntaxError.found) {
            completions = completions.filter(function (completion) {
                return _.startsWith(completion, syntaxError.found);
            }.bind(this));
        }

        this.logger.debug('Partial input', this.partialInput);

        if (this.partialInput) {
            completions = completions.filter(function (completion) {
                return _.startsWith(completion, this.partialInput);
            }.bind(this));
        }

        this.partialInput = null;

        return {error: syntaxError.expected, completions: completions};
    }
    return {error:null, completions: []};
};

/* Fill the completions area with completions candidates */
PeggyInput.prototype.fillCompletions = function (completions) {
    var html = '';
    completions.forEach(function (completion) {
        html += `<option value="${completion}">${completion}</option>`;
    });
    this.completionsArea.innerHTML = html;
};

/* Update the completion area. Fill and also show or hide. */
PeggyInput.prototype.updateCompletions = function () {
    this.logger.debug('Updating completions');
    this.completionsArea.innerHTML = '';
    var inputText = this.input.value;
    var completions = this.complete(inputText).completions;
    if (completions.length > 0) {
        this.fillCompletions(completions);
        this.completionsArea.style.display = "block";
    } else {
        this.completionsArea.style.display = "none";
    }
};

/* A partial input is the input that the user entered, but that doesn't match the completion rule, yet. */
/* For example, in a 'username' completion rule position, the partial input is part of the username entered, but that is not complete, yet. */
PeggyInput.prototype.setPartialInput = function (pinput) {
    // For setting the partial input, check that the input matches
    // input value at cursor position (what the user is entering).
    let inputStr = this.input.value.substring(0, this.input.getCursorPosition());
    let userStr = inputStr.substring(inputStr.length - pinput.length, inputStr.length);
    if (pinput == userStr) {
        this.logger.debug('Setting partial input:', pinput);
        this.partialInput = pinput;
    }
};

PeggyInput.prototype.insertCompletion = function (completion) {
    let cursorPosition = getCursorPosition(this.input);
    this.input.value = insertString(this.input.value, completion, cursorPosition);
    setCursorPosition(this.input, cursorPosition + completion.length);
    this.updateStatus();
};

PeggyInput.prototype.selectCompletion = function (completionVal) {

    let inputVal = this.input.value.substring(0, getCursorPosition(this.input));

    this.logger.debug('Completion selected', completionVal);

    // Try to match the completion repeatedly
    for (let i = Math.max(0, inputVal.length - completionVal.length); i < inputVal.length; i++) {
        let prefix = inputVal.substr(i, inputVal.length);
        if (_.startsWith(completionVal, prefix)) {
            // Found a prefix
            // Complete without the prefix
            this.insertCompletion(completionVal.substr(prefix.length, completionVal.length));
            this.updateCompletions();
            return;
        }
    }

    if (completionVal !== null) {
        this.insertCompletion(completionVal);
        this.updateCompletions();
    }
};

PeggyInput.prototype.keyUpHandler = function (ev) {
    //this.logger.debug(ev.key);
    switch(ev.key) {
        case 'ArrowDown':
            break;
        case 'ArrowUp':
            break;
        case 'Enter':
            // When selecting the completion we need to take into account
            // what the user has already entered.
            // For example, if a 'everyone' completion was chosen,
            // and the user already entered 'every', then only append 'one' to the input value
            this.selectCompletion(this.completionsArea.value);
            break;
        default: this.updateCompletions();
    }
};

PeggyInput.prototype.keyDownHandler = function (ev) {
    let selected = this.completionsArea.children('option:selected');
    switch(ev.key) {
        case 'ArrowDown':
            if (selected.length == 0) {
                this.completionsArea.queryElements('option')[0].selected = 'selected';
            } else {
                selected.selected = false;
                selected.nextElementSibling.selected = selected;
            }
            // Prevent cursor from moving to the end
            ev.preventDefault();
            break;
        case 'ArrowUp':
            if (selected.length == 0) {
                this.completionsArea.queryElements('option')[0].selected = 'selected';
            } else {
                selected.selected = false;
                selected.previousElementSibling.selected = selected;
            }
            // Prevent cursor from moving to the beginning
            ev.preventDefault();
            break;
    }
};

PeggyInput.prototype.getCandidatesLabels = function (candidates) {
    return _.map(candidates, 'label');
};

PeggyInput.prototype.getCandidatesValues = function (candidates) {
    return _.map(candidates, 'value');
};

PeggyInput.prototype.testGrammarCompleterMatches = function (completerName, label) {
    let match = _.includes(this.getCandidatesLabels(this.completers[completerName].candidates), label);
    this.logger.debug('Completing', completerName, label, match);
    if (!match) {
        this.setPartialInput(label);
    }
    return match;
};

/* Build an index for completion candidates */
/* The index has candidate labels as keys and candidate values as values */
/* This is used from the grammar blocks to return the completion value of the selected completion */
PeggyInput.prototype.buildCandidatesIndex = function (completerName, completer) {
    let index = new Map();

    _.forEach(completer.candidates, function (candidate) {
        index.set(candidate.label, candidate.value);
    });

    this.candidatesIndex[completerName] = index;
};

/* Return value of the completion from its label */
PeggyInput.prototype.getCandidateValue = function (completerName, label) {
    return this.candidatesIndex[completerName].get(label);
};

PeggyInput.prototype.expandCompletionRule = function (completerName) {
    let completionMatchingPredicate = '';
    let completer = this.completers[completerName];
    let matchCompletion = _.defaultTo(completer.matchCompletion ,true);

    if (matchCompletion) {
        completionMatchingPredicate = `&{ return options.peggyInput.testGrammarCompleterMatches("${completerName}", ${completerName}) }`;
    }

    return `${completerName} "${completerName}" = ${completerName}:(${this.completers[completerName].rule})` + completionMatchingPredicate + `{ return options.peggyInput.getCandidateValue("${completerName}", ${completerName}) || ${completerName} }`;
}

/* Normalize an array of completion candidates to an array of objects with label and value members */
PeggyInput.prototype.normalizeCandidates = function (candidates) {
    if (!_.isArray(candidates)) {
        return candidates;
    }

    if (_.isEmpty(candidates)) {
        return candidates;
    }

    if (_.isString(candidates[0])) {
        /* An array of strings. Normalize to an object with label and value. */
        return _.map(candidates, function (label) {
            return {'label':label, 'value':label};
        });
    }

    /* Otherwise, assume an array of objects with label and value.*/
    /* TODO: check? */
    return candidates;
};

/* Get an array of candidates depending on how candidates were specified */
PeggyInput.prototype.resolveCandidates = function (candidates) {
    /* If a function, evaluate it. Expect a Promise */
    if (_.isFunction(candidates)) {
        return candidates();
    } else if (_.isString(candidates)) { /* If a string, treat as url and fetch */
        return fetch(candidates)
            .then(res => res.json());
    } else if (_.isArray(candidates)) {
        return Promise.resolve(candidates);
    } else {
        throw new Error('Invalid candidates:', candidates);
    }
};

/* Initialization function */
PeggyInput.prototype.init = function (inputElOrSel, opts) {

    if (_.isString(inputElOrSel)) {
        this.input = document.querySelector(inputElOrSel);
    }
    else {
        this.input = inputElOrSel;
    }

    let defaultOptions = {
        showSyntaxErrorMsg: true,
        validateWhenBlank: this.input.required,
        completionsCharCount : 0
    };

    opts = _.defaults(opts, defaultOptions);

    this.logger.debug('Grammar', opts.grammar);
    this.grammar = opts.grammar;
    this.completers = opts.completers;
    this.changeHandler = opts.onChange;
    this.errorMsgFormatter = opts.errorMsgFormatter;
    this.validateWhenBlank = opts.validateWhenBlank;
    this.completionsCharCount = opts.completionsCharCount;

    this.input.addEventListener('change', this.updateStatus.bind(this));

    Object.keys(this.completers).forEach(function (completerName) {
        this.grammar += "\n";
        this.grammar += this.expandCompletionRule(completerName);
    }.bind(this));

    /* Fetch candidates if needed */
    let completers = _.values(this.completers);
    return Promise.all(_.map(completers, function (completer) {
        return this.resolveCandidates(completer.candidates);
    }.bind(this))).then(fetchedCandidates => {

        this.logger.debug('Fetched candidates', fetchedCandidates);

        /* Assign the fetched candidates */
        _.forEach(_.zip(completers, fetchedCandidates),
                  ([completer, candidates]) => {
                      completer.candidates = candidates;
                  });

        /* Normalize completion candidates */
        Object.keys(this.completers).forEach(function (completerName) {
            let completer = this.completers[completerName];
            completer.candidates = this.normalizeCandidates(completer.candidates);
            /* Build a reverse index for candidates, from label to value */
            this.buildCandidatesIndex(completerName, completer);
        }.bind(this))
    }).then(() => this.initUI(opts));
};

PeggyInput.prototype.initUI = function (opts) {

    this.logger.debug('Expanded grammar', this.grammar);

    this.parser = peggy.generate(this.grammar);

    this.syntaxErrorMsg = document.createElement('<div class="syntax-error" style="color: red; font-size: 10px; position: absolute;"></div>');
    if (!opts.showSyntaxErrorMsg) {
        this.syntaxErrorMsg.style.display = "none";
    }
    insertAfter(this.input, this.syntaxErrorMsg);

    let completionsAreaSize = _.defaultTo(opts.completionsAreaSize, 10);
    let completionsAreaWidth = _.defaultTo(opts.completionsAreaWidth, 400);
    this.completionsArea = document.createElement(`<select size=${completionsAreaSize} style="width: ${completionsAreaWidth}px;position:absolute;display:block;">`);
    this.completionsArea.style.left = this.input.style.position.left;
    this.syntaxErrorMsg.style.left = this.input.style.position.left;
    this.completionsArea.style.display = "none";
    insertAfter(this.syntaxErrorMsg, this.completionsArea);
    this.completionsArea.addEventListener('change', (ev) => {
        console.log('Select completion!', ev);
        this.selectCompletion(this.completionsArea.value);
    });
    this.completionsArea.addEventListener('blur', () => {
        this.completionsArea.style.display = "none";
    });

    this.input.addEventListener('focus', this.updateCompletions.bind(this));
    this.input.addEventListener('blur', () => {
        // Don't close the completions area immediatly. We need
        // to give it some time in order to be able to process a possible click event
        // on one of the completion candidates.
        setTimeout(() => {
            if (document.activeElement !== this.completionsArea) {
                this.completionsArea.style.display = "none";
            }
        }, 200);
    });
    this.input.addEventListener('keyup', this.keyUpHandler.bind(this));
    this.input.addEventListener('keydown', this.keyDownHandler.bind(this));
};

// Exports
window.PeggyInput = function(inputElOrSel, opts) {
    return new PeggyInput(inputElOrSel, opts);
}
